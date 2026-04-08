/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { RFData, TRNData, RadioData, DashboardStats, bucketDelay } from '../types';

export const parseFile = async (file: File | Blob, fileName?: string): Promise<any[]> => {
  const name = fileName || (file as File).name || '';
  return new Promise((resolve, reject) => {
    if (name.endsWith('.csv')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const dateRegex = /\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/;
        
        // Scan first 1000 chars for a date
        let foundDate: string | null = null;
        const match = text.slice(0, 1000).match(dateRegex);
        if (match) {
          const dateStr = match[0];
          let d = new Date(dateStr);
          if (isNaN(d.getTime())) {
            const dmyMatch = dateStr.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
            if (dmyMatch) {
              const day = dmyMatch[1].padStart(2, '0');
              const month = dmyMatch[2].padStart(2, '0');
              let year = dmyMatch[3];
              if (year.length === 2) year = `20${year}`;
              d = new Date(`${year}-${month}-${day}`);
            }
          }
          if (!isNaN(d.getTime())) {
            foundDate = dateStr;
          }
        }

        // Extract ID from filename if possible
        let extractedId: string | null = null;
        const nameOnly = name.split('/').pop() || name;
        
        // Try various patterns for ID extraction
        // 1. Date prefix: 20260328_VAPI_RFCOMM
        // 2. No date prefix: VAPI_RFCOMM
        // 3. Hyphenated IDs: VAPI-UVD_RFCOMM
        // 4. Station markers: VAPI_ST, VAPI_STN
        const idMatch = nameOnly.match(/(?:\d{8}_)?([A-Z0-9_\-]{2,15})_(?:RFCOMM|ST|STN)/i) || 
                        nameOnly.match(/(?:\d{8}_)?([A-Z0-9_\-]{2,15})/i);
        
        if (idMatch) {
          extractedId = idMatch[1];
          // Clean up if it matched something too long or generic
          const upperId = extractedId.toUpperCase();
          if (['RFCOMM', 'STATION', 'TRAIN', 'STN', 'LOCO', 'REPORT', 'LOG'].includes(upperId)) {
            extractedId = null;
          }
        }
        const isTrainFile = name.toUpperCase().includes('RFCOMM_TR') || name.toUpperCase().includes('LOCO');
        const isStationFile = name.toUpperCase().includes('RFCOMM_ST') || name.toUpperCase().includes('STN') || name.toUpperCase().includes('STATION');

        Papa.parse(text, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => {
            // Clean keys
            const cleaned = results.data.map((row: any) => {
              const newRow: any = {};
              Object.keys(row).forEach(key => {
                newRow[key.trim()] = row[key];
              });
              if (foundDate && !newRow['Date'] && !newRow['Log Date']) {
                newRow['_extractedDate'] = foundDate;
              }
              if (extractedId) {
                if (isTrainFile) newRow['_extractedLocoId'] = extractedId;
                if (isStationFile) newRow['_extractedStationId'] = extractedId;
              }
              return newRow;
            });
            resolve(cleaned);
          },
          error: (error) => reject(error),
        });
      };
      reader.onerror = (error) => reject(error);
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        // Try to find the header row if the first one seems wrong
        const expectedHeaders = ['Expected', 'Received', 'Station', 'Loco', 'Direction', 'Success', 'Nominal', 'Reverse'];
        let headerRowIndex = 0;
        for (let i = 0; i < Math.min(rawData.length, 10); i++) {
          const row = rawData[i];
          if (Array.isArray(row)) {
            const hasHeader = row.some(cell => 
              expectedHeaders.some(h => String(cell).toLowerCase().includes(h.toLowerCase()))
            );
            if (hasHeader) {
              headerRowIndex = i;
              break;
            }
          }
        }
        
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { range: headerRowIndex });
        
        // Aggressive date search in headers/first rows if not found in data
        let foundDate: string | null = null;
        const dateRegex = /\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/;
        
        // Scan first 10 rows for anything that looks like a date
        for (let i = 0; i < Math.min(rawData.length, 10); i++) {
          const row = rawData[i];
          if (Array.isArray(row)) {
            for (const cell of row) {
              const cellStr = String(cell);
              if (dateRegex.test(cellStr)) {
                const match = cellStr.match(dateRegex);
                if (match) {
                  const dateStr = match[0];
                  // Robust check: try parsing as is, then try DMY
                  let d = new Date(dateStr);
                  if (isNaN(d.getTime())) {
                    const dmyMatch = dateStr.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
                    if (dmyMatch) {
                      const day = dmyMatch[1].padStart(2, '0');
                      const month = dmyMatch[2].padStart(2, '0');
                      let year = dmyMatch[3];
                      if (year.length === 2) year = `20${year}`;
                      d = new Date(`${year}-${month}-${day}`);
                    }
                  }

                  if (!isNaN(d.getTime())) {
                    foundDate = dateStr;
                    break;
                  }
                }
              }
            }
          }
          if (foundDate) break;
        }

        // Extract ID from filename if possible
        let extractedId: string | null = null;
        const nameOnly = name.split('/').pop() || name;
        
        // Try various patterns for ID extraction
        // 1. Date prefix: 20260328_VAPI_RFCOMM
        // 2. No date prefix: VAPI_RFCOMM
        // 3. Hyphenated IDs: VAPI-UVD_RFCOMM
        // 4. Station markers: VAPI_ST, VAPI_STN
        const idMatch = nameOnly.match(/(?:\d{8}_)?([A-Z0-9_\-]{2,15})_(?:RFCOMM|ST|STN)/i) || 
                        nameOnly.match(/(?:\d{8}_)?([A-Z0-9_\-]{2,15})/i);
        
        if (idMatch) {
          extractedId = idMatch[1];
          // Clean up if it matched something too long or generic
          const upperId = extractedId.toUpperCase();
          if (['RFCOMM', 'STATION', 'TRAIN', 'STN', 'LOCO', 'REPORT', 'LOG'].includes(upperId)) {
            extractedId = null;
          }
        }
        const isTrainFile = name.toUpperCase().includes('RFCOMM_TR') || name.toUpperCase().includes('LOCO');
        const isStationFile = name.toUpperCase().includes('RFCOMM_ST') || name.toUpperCase().includes('STN') || name.toUpperCase().includes('STATION');

        // Clean keys
        const cleaned = jsonData.map((row: any) => {
          const newRow: any = {};
          Object.keys(row).forEach(key => {
            newRow[key.trim()] = row[key];
          });
          if (foundDate && !newRow['Date'] && !newRow['Log Date']) {
            newRow['_extractedDate'] = foundDate;
          }
          if (extractedId) {
            if (isTrainFile) newRow['_extractedLocoId'] = extractedId;
            if (isStationFile) newRow['_extractedStationId'] = extractedId;
          }
          return newRow;
        });
        resolve(cleaned);
      };
      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(file);
    }
  });
};

const findColumn = (row: any, ...aliases: string[]) => {
  if (!row) return null;
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const found = keys.find(k => k.toLowerCase().replace(/\s/g, '') === (alias || '').toLowerCase().replace(/\s/g, ''));
    if (found) return found;
  }
  return null;
};

const parseTime = (timeStr: any): number => {
  if (!timeStr || timeStr === 'N/A' || timeStr === 'Unknown') return NaN;
  let s = String(timeStr).trim();
  
  // Base date for time-only strings to ensure consistency
  const baseDateStr = '2000-01-01';

  // Handle HH:MM:SS only
  if (s.match(/^\d{1,2}:\d{1,2}:\d{1,2}$/)) {
    const [h, m, sec] = s.split(':').map(Number);
    const d = new Date(`${baseDateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`);
    return d.getTime();
  }

  // Handle YYYYMMDDHHMMSS or YYYYMMDD
  if (s.match(/^\d{8,14}$/)) {
    const year = s.substring(0, 4);
    const month = s.substring(4, 6);
    const day = s.substring(6, 8);
    const timePart = s.length > 8 ? `T${s.substring(8, 10)}:${s.substring(10, 12)}:${s.substring(12, 14) || '00'}` : '';
    const d = new Date(`${year}-${month}-${day}${timePart}`);
    if (!isNaN(d.getTime())) return d.getTime();
  }

  // Handle YYYY/MM/DD or YYYY-MM-DD or YYYY_MM_DD
  const ymdRegex = /^(\d{4})[-/._](\d{1,4})[-/._](\d{1,4})(.*)$/;
  const ymdMatch = s.match(ymdRegex);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    const rest = ymdMatch[4] || '';
    s = `${year}-${month}-${day}${rest.replace(/[/._]/g, '-')}`;
  } else {
    // Handle DD/MM/YYYY or DD-MM-YYYY or DD_MM_YYYY
    const dmyRegex = /^(\d{1,4})[-/._](\d{1,4})[-/._](\d{2,4})(.*)$/;
    const dmyMatch = s.match(dmyRegex);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const month = dmyMatch[2].padStart(2, '0');
      let year = dmyMatch[3];
      if (year.length === 2) year = `20${year}`;
      const rest = dmyMatch[4] || '';
      s = `${year}-${month}-${day}${rest.replace(/[/._]/g, '-')}`;
    }
  }

  // Final normalization: replace all / and _ with - and handle the weird 2026/03/2028 case
  s = s.replace(/[/._]/g, '-');
  const weirdDateMatch = s.match(/^(\d{4})-(\d{2})-(\d{4})(.*)$/);
  if (weirdDateMatch) {
    // Take the first 2 digits of the second "year" as the day
    const day = weirdDateMatch[3].substring(0, 2);
    s = `${weirdDateMatch[1]}-${weirdDateMatch[2]}-${day}${weirdDateMatch[4]}`;
  }

  const d = new Date(s);
  if (isNaN(d.getTime())) {
    // Fallback: try to extract just the time HH:MM:SS
    const timeMatch = s.match(/(\d{1,2}):(\d{1,2}):(\d{1,2})/);
    if (timeMatch) {
      const h = parseInt(timeMatch[1]);
      const m = parseInt(timeMatch[2]);
      const sec = parseInt(timeMatch[3]);
      const d = new Date(`${baseDateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`);
      return d.getTime();
    }
  }
  return d.getTime();
};

const parseNumber = (val: any): number => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const str = String(val).replace(/[%,]/g, '').trim();
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
};

export const parseDateString = (d: string) => {
  if (!d || d === 'Unknown' || d === 'N/A') return 0;
  const parts = d.split(/[-/.]/);
  if (parts.length === 3) {
    let day, month, year;
    // Check if first part is a year (4 digits)
    if (parts[0].length === 4) {
      year = parseInt(parts[0]);
      month = parseInt(parts[1]) - 1;
      day = parseInt(parts[2]);
    } else {
      // Assume DD-MM-YYYY
      day = parseInt(parts[0]);
      month = parseInt(parts[1]) - 1;
      year = parts[2].length === 2 ? 2000 + parseInt(parts[2]) : parseInt(parts[2]);
    }
    const date = new Date(year, month, day);
    return isNaN(date.getTime()) ? 0 : date.getTime();
  }
  const date = new Date(d);
  return isNaN(date.getTime()) ? 0 : date.getTime();
};

export const formatStationName = (stn: string | number | undefined) => {
  if (!stn) return 'N/A';
  const s = String(stn).trim().toUpperCase();
  if (s === 'N/A' || s === '-' || s === '' || s === '0' || s === '0.0') return 'N/A';
  if (s.endsWith('STATION')) return s;
  return `${s} STATION`;
};

export const processDashboardData = (
  rfData: RFData[],
  trnData: TRNData[] | null,
  radioData: RadioData[],
  rfStData: RFData[] = []
): DashboardStats => {
  const firstRf = rfData[0] || {};
  const firstRfSt = rfStData[0] || {};
  const firstRfAny = rfData.length > 0 ? firstRf : firstRfSt;
  const firstTrn = trnData?.[0] || {};
  const firstRadio = radioData[0] || {};

  const isValidLocoId = (id: any) => {
    if (id === null || id === undefined) return false;
    const s = String(id).trim();
    const low = s.toLowerCase();
    return s !== '' && s !== '-' && s !== 'N/A' && s !== 'null' && s !== 'undefined' && 
           low !== 'loco id' && low !== 'locoid' && low !== 'loco_id' &&
           s !== '0' && s !== '0.0';
  };

  const isValidStationId = (id: any) => {
    if (id === null || id === undefined) return false;
    const s = String(id).trim();
    const low = s.toLowerCase();
    return s !== '' && s !== '-' && s !== 'N/A' && s !== 'null' && s !== 'undefined' && 
           low !== 'station id' && low !== 'stationid' && low !== 'station_id' &&
           s !== '0' && s !== '0.0';
  };

  const getBestLocoIdFromRow = (row: any, keys: string[], currentDefault: string) => {
    if (!row) return currentDefault;
    // Try user specified columns first: I (8) and AI (34)
    const indices = [8, 34, 17, 33, 4]; // I, AI, R, AH, E
    for (const idx of indices) {
      if (keys && keys[idx]) {
        const val = row[keys[idx]];
        if (isValidLocoId(val)) return String(val).trim();
      }
    }
    // Try named columns
    const namedCandidates = [
      row[trnLocoIdCol],
      row[locoIdCol],
      row[radioLocoIdCol],
      row['_extractedLocoId']
    ];
    for (const val of namedCandidates) {
      if (isValidLocoId(val)) return String(val).trim();
    }
    return currentDefault;
  };

  const locoIdCol = findColumn(firstRfAny, 'Loco Id', 'LocoId', 'Loco_Id', 'Loco No', 'LocoNo', 'Loco_No', 'Engine No', 'EngineId', 'Loco', 'Engine') || 'Loco Id';
  const trnLocoIdCol = findColumn(firstTrn, 'Loco Id', 'LocoId', 'Loco_Id', 'Loco No', 'LocoNo', 'Loco_No', 'Engine No', 'EngineId', 'Loco', 'Engine') || 'Loco Id';
  const radioLocoIdCol = findColumn(firstRadio, 'Loco Id', 'LocoId', 'Loco_Id', 'Loco No', 'LocoNo', 'Loco_No', 'Engine No', 'EngineId', 'Loco', 'Engine') || 'Loco Id';
  const rfKeys_ = Object.keys(firstRfAny);
  const stnIdCol = findColumn(firstRfAny, 'Station Id', 'StationId', 'Station_Id', 'Station', 'Stn', 'StnId', 'Stn_Id', 'Station Name', 'StationName');
  const stnNameCol = findColumn(firstRfAny, 'Station Name', 'StationName', 'Station_Name', 'StnName', 'Stn Name', 'Station_Name_1');
  const percentageCol = findColumn(firstRfAny, 'Percentage', 'Perc', 'Success', 'RFCOMM %', 'Success %', 'Perc %', 'SuccessPerc', 'Success_Perc') || (rfKeys_.length > 7 ? rfKeys_[7] : 'Percentage');
  const nominalPercCol = findColumn(firstRfAny, 'Nominal Perc', 'NominalPerc', 'Nominal %') || 'Nominal Perc';
  const reversePercCol = findColumn(firstRfAny, 'Reverse Perc', 'ReversePerc', 'Reverse %') || 'Reverse Perc';
  
  const stationMap: Record<string, string> = {};
  rfData.forEach(row => {
    const id = String(row[stnIdCol] || '').trim();
    const name = String(row[stnNameCol] || '').trim();
    if (id && id !== 'N/A' && name && name !== 'N/A') stationMap[id] = name;
  });
  rfStData.forEach(row => {
    const id = String(row[stnIdCol] || '').trim();
    const name = String(row[stnNameCol] || '').trim();
    if (id && id !== 'N/A' && name && name !== 'N/A') stationMap[id] = name;
  });

  // Pre-process TRN data to fill missing station names/IDs based on adjacent rows
  if (trnData && trnData.length > 0) {
    const trnKeys = Object.keys(trnData[0]);
    const trnStnNameCol = findColumn(trnData[0], 'Station Name', 'StationName', 'Station_Name') || trnKeys[2];
    const trnStnIdCol = findColumn(trnData[0], 'Station Id', 'StationId', 'Station_Id');
    const trnStnCode2Col = findColumn(trnData[0], 'Station Code2', 'StationCode2', 'Station_Code2');

    for (let i = 0; i < trnData.length; i++) {
      const row = trnData[i];
      const prevRow = i > 0 ? trnData[i - 1] : null;
      const nextRow = i < trnData.length - 1 ? trnData[i + 1] : null;

      if (trnStnNameCol) {
        const currentName = String(row[trnStnNameCol] || '').trim();
        if (!currentName || currentName === '-' || currentName === 'N/A' || currentName === '0' || currentName === '0.0') {
          const prevName = prevRow ? String(prevRow[trnStnNameCol] || '').trim() : '';
          const nextName = nextRow ? String(nextRow[trnStnNameCol] || '').trim() : '';
          if (prevName && prevName !== '-' && prevName !== 'N/A' && prevName !== '0' && prevName !== '0.0' && prevName === nextName) {
            row[trnStnNameCol] = prevName;
          } else if (trnStnCode2Col) {
            const fallbackData = String(row[trnStnCode2Col] || '').trim();
            if (fallbackData && fallbackData !== '-' && fallbackData !== 'N/A' && fallbackData !== '0' && fallbackData !== '0.0') {
              row[trnStnNameCol] = fallbackData;
            }
          }
        }
      }

      if (trnStnIdCol) {
        const currentId = String(row[trnStnIdCol] || '').trim();
        if (!currentId || currentId === '-' || currentId === 'N/A' || currentId === '0' || currentId === '0.0') {
          const prevId = prevRow ? String(prevRow[trnStnIdCol] || '').trim() : '';
          const nextId = nextRow ? String(nextRow[trnStnIdCol] || '').trim() : '';
          if (prevId && prevId !== '-' && prevId !== 'N/A' && prevId !== '0' && prevId !== '0.0' && prevId === nextId) {
            row[trnStnIdCol] = prevId;
          } else if (trnStnCode2Col) {
            const fallbackData = String(row[trnStnCode2Col] || '').trim();
            if (fallbackData && fallbackData !== '-' && fallbackData !== 'N/A' && fallbackData !== '0' && fallbackData !== '0.0') {
              row[trnStnIdCol] = fallbackData;
            }
          }
        }
      }
    }
  }
  
  // RF Time Logic: User says D and F columns (index 3 and 5)
  const rfDateCol = findColumn(firstRfAny, 'Date', 'Log Date', 'LogDate', 'Log_Date', 'Report Date', 'ReportDate', 'Date_Time', 'DateTime', 'Day', 'LogDay');
  const rfTimeOnlyCol = findColumn(firstRfAny, 'Time', 'Log Time', 'LogTime', 'Log_Time', 'Report Time', 'ReportTime', 'Clock', 'LogTime');
  const rfTimestampCol = findColumn(firstRfAny, 'Timestamp', 'DateTime', 'Date Time', 'Log Time Stamp', 'Log_Time_Stamp', 'Time_Stamp', 'TimeStamp');
  
  const cleanTimeStr = (str: any) => {
    if (!str) return 'N/A';
    const s = String(str).trim();
    const parts = s.split(/\s+/);
    if (parts.length >= 3 && /^\d+$/.test(parts[parts.length - 1])) {
      return parts.slice(0, parts.length - 1).join(' ');
    }
    return s;
  };

  const normalizeDate = (d: string) => {
    if (!d || d === 'Unknown' || d === 'N/A') return 'Unknown';
    const parts = d.split(/[-/.]/);
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      let year = parts[2];
      if (year.length === 2) year = `20${year}`;
      return `${day}/${month}/${year}`;
    }
    return d;
  };

  const getRfTime = (row: any) => {
    let rawTime = 'N/A';
    const keys = Object.keys(row);
    const findInRow = (...aliases: string[]) => {
      for (const alias of aliases) {
        const found = keys.find(k => k.toLowerCase().replace(/\s/g, '') === (alias || '').toLowerCase().replace(/\s/g, ''));
        if (found) return found;
      }
      return null;
    };

    const rfDateCol_ = findInRow('Date', 'Log Date', 'LogDate', 'Log_Date', 'Report Date', 'ReportDate', 'Date_Time', 'DateTime', 'Day', 'LogDay', 'From', 'To');
    const rfTimeOnlyCol_ = findInRow('Time', 'Log Time', 'LogTime', 'Log_Time', 'Report Time', 'ReportTime', 'Clock', 'LogTime', 'From', 'To');
    const rfTimestampCol_ = findInRow('Timestamp', 'DateTime', 'Date Time', 'Log Time Stamp', 'Log_Time_Stamp', 'Time_Stamp', 'TimeStamp', 'From', 'To');

    if (rfTimestampCol_ && row[rfTimestampCol_]) rawTime = String(row[rfTimestampCol_]);
    else if (rfDateCol_ && rfTimeOnlyCol_ && row[rfDateCol_] && row[rfTimeOnlyCol_]) {
      rawTime = `${row[rfDateCol_]} ${row[rfTimeOnlyCol_]}`;
    }
    else if (row['_extractedDate'] && rfTimeOnlyCol_ && row[rfTimeOnlyCol_]) {
      rawTime = `${row['_extractedDate']} ${row[rfTimeOnlyCol_]}`;
    }
    else if (rfTimeOnlyCol_ && row[rfTimeOnlyCol_]) rawTime = String(row[rfTimeOnlyCol_]);
    else if (rfDateCol_ && row[rfDateCol_]) rawTime = String(row[rfDateCol_]);
    else if (row['_extractedDate']) rawTime = String(row['_extractedDate']);
    else if (keys.length > 3 && keys.length > 5 && row[keys[3]] && row[keys[5]]) {
      rawTime = `${row[keys[3]]} ${row[keys[5]]}`;
    }
    else if (keys.length > 3 && row[keys[3]]) rawTime = String(row[keys[3]]);
    else if (keys.length > 5 && row[keys[5]]) rawTime = String(row[keys[5]]);
    
    // Ensure date is in the time string if we have it
    const rawDate = String(row._extractedDate || (rfDateCol_ && row[rfDateCol_]) || '').trim();
    const rowDate = normalizeDate(rawDate);
    if (rowDate && rowDate !== 'Unknown' && rowDate !== 'N/A' && !rawTime.includes(rowDate)) {
      rawTime = `${rowDate} ${rawTime}`;
    }
    
    return cleanTimeStr(rawTime);
  };

  const getRfTimestamp = (row: any) => {
    const timeStr = getRfTime(row);
    if (timeStr === 'N/A') return 0;
    const parts = timeStr.split(' ');
    if (parts.length === 2) {
      const dateParts = parts[0].split(/[-/.]/);
      const timeParts = parts[1].split(':');
      if (dateParts.length === 3 && timeParts.length >= 2) {
        const d = parseInt(dateParts[0]);
        const m = parseInt(dateParts[1]) - 1;
        const y = dateParts[2].length === 2 ? 2000 + parseInt(dateParts[2]) : parseInt(dateParts[2]);
        const hh = parseInt(timeParts[0]);
        const mm = parseInt(timeParts[1]);
        const ss = timeParts.length > 2 ? parseInt(timeParts[2]) : 0;
        const date = new Date(y, m, d, hh, mm, ss);
        return isNaN(date.getTime()) ? 0 : date.getTime();
      }
    }
    const d = new Date(timeStr);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  };

  const getTrnTime = (row: any) => {
    let rawTime = String(row[trnTimeCol] || 'N/A');
    const rawDate = String(row._extractedDate || (trnDateCol && row[trnDateCol]) || '').trim();
    const rowDate = normalizeDate(rawDate);
    if (rowDate && rowDate !== 'Unknown' && rowDate !== 'N/A' && !rawTime.includes(rowDate)) {
      rawTime = `${rowDate} ${rawTime}`;
    }
    return rawTime;
  };

  const getRadioTime = (row: any) => {
    let rawTime = String(row[radioTimeCol] || 'N/A');
    const rawDate = String(row._extractedDate || (radioDateCol && row[radioDateCol]) || '').trim();
    const rowDate = normalizeDate(rawDate);
    if (rowDate && rowDate !== 'Unknown' && rowDate !== 'N/A' && !rawTime.includes(rowDate)) {
      rawTime = `${rowDate} ${rawTime}`;
    }
    return rawTime;
  };

  const trnTimeCol = findColumn(firstTrn, 'Time', 'Timestamp', 'Date', 'DateTime', 'LogTime') || 'Time';
  const trnDateCol = findColumn(firstTrn, 'Date', 'Log Date', 'LogDate');
  const radioTimeCol = findColumn(firstRadio, 'Time', 'Timestamp', 'Time_DT', 'LogTime') || 'Time';
  const radioDateCol = findColumn(firstRadio, 'Date', 'Log Date', 'LogDate');

  // Find first valid locoId for default
  let locoId = 'N/A';
  const trnKeys_ = trnData && trnData.length > 0 ? Object.keys(trnData[0]) : [];
  
  const firstValidRf = rfData.find(r => isValidLocoId(r[locoIdCol] || r['_extractedLocoId']));
  const firstValidTrn = trnData?.find(r => getBestLocoIdFromRow(r, trnKeys_, 'N/A') !== 'N/A');
  const firstValidRadio = radioData.find(r => isValidLocoId(r[radioLocoIdCol] || r['_extractedLocoId']));
  
  if (firstValidRf) locoId = String(firstValidRf[locoIdCol] || firstValidRf['_extractedLocoId']).trim();
  else if (firstValidTrn) locoId = getBestLocoIdFromRow(firstValidTrn, trnKeys_, 'N/A');
  else if (firstValidRadio) locoId = String(firstValidRadio[radioLocoIdCol] || firstValidRadio['_extractedLocoId']).trim();

  const allLocos = new Set<string>();
  rfData.forEach(row => { 
    const val = row[locoIdCol] || row['_extractedLocoId'];
    if (isValidLocoId(val)) allLocos.add(String(val).trim()); 
  });
  trnData?.forEach(row => {
    const val = getBestLocoIdFromRow(row, trnKeys_, 'N/A');
    if (isValidLocoId(val)) allLocos.add(val);
  });
  rfStData.forEach(row => { 
    const val = row[locoIdCol] || row['_extractedLocoId'];
    if (isValidLocoId(val)) allLocos.add(String(val).trim()); 
  });
  trnData?.forEach(row => { 
    const val = row[trnLocoIdCol] || row['_extractedLocoId'];
    if (isValidLocoId(val)) allLocos.add(String(val).trim()); 
  });
  radioData.forEach(row => { 
    const val = row[radioLocoIdCol] || row['_extractedLocoId'];
    if (isValidLocoId(val)) allLocos.add(String(val).trim()); 
  });
  const locoIds = Array.from(allLocos);

  // Station Performance & Stats
  const stnGroups: Record<string, { 
    expected: number; 
    received: number; 
    percentages: number[];
    times: string[]; 
    locoId: string | number; 
    date: string;
    source: 'train' | 'station';
  }> = {};
  
  const trnKeys = trnData && trnData.length > 0 ? Object.keys(trnData[0]) : [];
  const trnRadioCol = trnKeys[4] || 'Radio'; // Column E is index 4
  
  const expectedCol = findColumn(firstRfAny, 'Expected', 'Exp', 'Total', 'Expected Count', 'Exp Count', 'ExpCount') || (rfKeys_.length > 5 ? rfKeys_[5] : 'Expected');
  const receivedCol = findColumn(firstRfAny, 'Received', 'Rec', 'SuccessCount', 'Recieved Count', 'Rec Count', 'RecCount', 'Success') || (rfKeys_.length > 6 ? rfKeys_[6] : 'Received');
  const radioCol = findColumn(firstRfAny, 'Radio', 'Modem', 'RadioId', 'Radio_Id', 'ModemId', 'Modem_Id', 'Radio No', 'RadioNo', 'Radio_No') || (rfKeys_.length > 29 ? rfKeys_[29] : 'Radio'); // Column AD is index 29
  const directionCol = findColumn(firstRfAny, 'Direction', 'Mode', 'Nominal/Reverse', 'Type', 'Nominal_Reverse', 'Dir', 'Nom/Rev', 'Nominal_Rev') || (rfKeys_.length > 4 ? rfKeys_[4] : 'Direction');

  const seenRfRows = new Set<string>();
  
  let skippedRfRows = 0;
  const processRfRow = (row: any, source: 'train' | 'station') => {
    const keys = Object.keys(row);
    const findInRow = (...aliases: string[]) => {
      for (const alias of aliases) {
        const found = keys.find(k => k.toLowerCase().replace(/\s/g, '') === (alias || '').toLowerCase().replace(/\s/g, ''));
        if (found) return found;
      }
      return null;
    };

    const effectiveSource = source;

    const sIdCol = findInRow('Station Id', 'StationId', 'Station_Id', 'Station', 'Stn', 'StnId', 'Stn_Id', 'Station Name', 'StationName');
    let stnId = '';
    
    // Priority 1: Explicit column match
    if (sIdCol) {
      stnId = String(row[sIdCol] || '').trim();
    }
    
    // Priority 2: Extracted from filename (very reliable for station logs)
    // We use it if stnId is missing or if it looks like a generic value
    const isGeneric = !stnId || ['STATION', 'STN', 'PROJECT', 'SYSTEM'].includes(stnId.toUpperCase());
    if (isGeneric && row['_extractedStationId']) {
      stnId = String(row['_extractedStationId']).trim();
    }
    
    // Priority 3: Fallback to first column only if we have no other choice and it's not a known non-station-id value
    if (!stnId && !sIdCol && keys.length > 0) {
      const fallbackId = String(row[keys[0]] || '').trim();
      const blacklist = ['project', 'system', 'log', 'report', 'date', 'time', 'loco', 'train'];
      if (fallbackId && !blacklist.some(b => fallbackId.toLowerCase().includes(b))) {
        stnId = fallbackId;
      }
    }
    
    if (!stnId || stnId.toLowerCase() === 'station id' || stnId.toLowerCase() === 'stationid') {
      skippedRfRows++;
      return;
    }
    
    const dCol = findInRow('Direction', 'Mode', 'Nominal/Reverse', 'Type', 'Nominal_Reverse', 'Dir', 'Nom/Rev', 'Nominal_Rev') || (keys.length > 1 ? keys[1] : '');
    const rawDirection = String(row[dCol] || 'N/A');
    const direction = rawDirection.toLowerCase().includes('nominal') ? 'Nominal' : 
                      rawDirection.toLowerCase().includes('reverse') ? 'Reverse' : rawDirection;
    
    const lIdCol = findInRow('Loco Id', 'LocoId', 'Loco_Id', 'Loco No', 'LocoNo', 'Loco_No', 'Engine No', 'EngineId', 'Loco', 'Engine') || (keys.length > 2 ? keys[2] : '');
    let rawRowLocoId = row[lIdCol] || row['_extractedLocoId'] || locoId;
    
    if (!isValidLocoId(rawRowLocoId)) {
      rawRowLocoId = effectiveSource === 'station' ? 'Station Log' : 'Unknown Loco';
    }
    
    const rowLocoId = String(rawRowLocoId).trim();
    const rfDateCol_ = findInRow('Date', 'Log Date', 'LogDate', 'Log_Date', 'Report Date', 'ReportDate', 'Date_Time', 'DateTime', 'Day', 'LogDay', 'From', 'To');
    const rawDate = String(row._extractedDate || (rfDateCol_ && row[rfDateCol_]) || 'Unknown').trim();
    const rowDateNormalized = normalizeDate(rawDate);
    const rowTime = getRfTime(row);
    
    const rowKey = `${rowLocoId}|${stnId}|${direction}|${rowTime}|${rowDateNormalized}|${effectiveSource}`;
    if (seenRfRows.has(rowKey)) return;
    seenRfRows.add(rowKey);

    const key = `${stnId}|${direction}|${rowLocoId}|${rowDateNormalized}|${effectiveSource}`;
    
    if (!stnGroups[key]) stnGroups[key] = { 
      expected: 0, received: 0, 
      percentages: [],
      times: [], locoId: rowLocoId, date: rowDateNormalized,
      source: effectiveSource
    };
    
    const eCol = findInRow('Expected', 'Exp', 'Total', 'Expected Count', 'Exp Count', 'ExpCount') || (keys.length > 5 ? keys[5] : '');
    const rCol = findInRow('Received', 'Rec', 'SuccessCount', 'Recieved Count', 'Rec Count', 'RecCount', 'Success') || (keys.length > 6 ? keys[6] : '');
    const pCol = findInRow('Percentage', 'Perc', 'Success', 'RFCOMM %', 'Success %', 'Perc %', 'SuccessPerc', 'Success_Perc') || (keys.length > 7 ? keys[7] : '');

    const exp = parseNumber(row[eCol]);
    const rec = parseNumber(row[rCol]);
    const perc = parseNumber(row[pCol]) || (exp > 0 ? (rec / exp) * 100 : 0);
    
    stnGroups[key].expected += exp;
    stnGroups[key].received += rec;
    stnGroups[key].percentages.push(perc);
    
    if (rowTime !== 'N/A') stnGroups[key].times.push(rowTime);
  };

  rfData.forEach(row => processRfRow(row, 'train'));
  rfStData.forEach(row => processRfRow(row, 'station'));

  console.log(`Processed RFCOMM: Train Rows=${rfData.length}, Station Rows=${rfStData.length}`);
  console.log(`Aggregated Station Stats: ${Object.keys(stnGroups).length} groups`);

  const stationStats = Object.entries(stnGroups).map(([key, data]) => {
    const parts = key.split('|');
    const stationId = parts[0];
    const direction = parts[1];
    const totalPercSum = data.percentages.reduce((a, b) => a + b, 0);
    const rowCount = data.percentages.length;
    const percentage = data.expected > 0 ? (data.received / data.expected) * 100 : (rowCount > 0 ? totalPercSum / rowCount : 0);

    return {
      stationId,
      direction,
      percentage,
      expected: data.expected,
      received: data.received,
      locoId: data.locoId,
      date: data.date,
      rowCount,
      totalPercSum,
      source: data.source
    };
  });

  const stnPerf = Object.entries(stnGroups).map(([key, data]) => {
    const [stationId] = key.split('|');
    const sortedTimes = [...data.times].sort();
    
    const percentage = data.expected > 0 
      ? (data.received / data.expected) * 100 
      : (data.percentages.length > 0 ? data.percentages.reduce((a, b) => a + b, 0) / data.percentages.length : 0);

    return {
      stationId,
      percentage,
      locoId: data.locoId,
      date: data.date,
      startTime: sortedTimes.length > 0 ? sortedTimes[0] : 'N/A',
      endTime: sortedTimes.length > 0 ? sortedTimes[sortedTimes.length - 1] : 'N/A'
    };
  });

  const rawRfLogs = rfData
    .filter(row => isValidLocoId(row[locoIdCol] || locoId))
    .map(row => {
      const direction = String(row[directionCol] || 'N/A');
      const percentage = Number(row[percentageCol]) || 0;
      const isNominal = direction.toLowerCase().includes('nominal');
      const isReverse = direction.toLowerCase().includes('reverse');
      
      let sId = 'N/A';
      if (stnIdCol && row[stnIdCol]) {
        sId = String(row[stnIdCol]).trim();
      } else if (row['_extractedStationId']) {
        sId = String(row['_extractedStationId']).trim();
      }
      
      return {
        stationId: sId,
        direction,
        expected: Number(row[expectedCol]) || 0,
        received: Number(row[receivedCol]) || 0,
        nominalPerc: isNominal ? percentage : 0,
        reversePerc: isReverse ? percentage : 0,
        time: getRfTime(row),
        date: normalizeDate(String(row._extractedDate || (rfDateCol && row[rfDateCol]) || 'Unknown').trim()),
        locoId: String(row[locoIdCol] || locoId).trim()
      };
    });

  const badStns = Array.from(new Set(stnPerf.filter((s) => s.percentage < 95).map((s) => s.stationId)));
  const goodStns = Array.from(new Set(stnPerf.filter((s) => s.percentage >= 98).map((s) => s.stationId)));

  // Multi-Loco Bad Station Logic
  const stnLocoMap: Record<string | number, { 
    locoDetails: { id: string | number; perf: number; startTime: string; endTime: string }[];
    totalPerf: number; 
    count: number 
  }> = {};
  
  stnPerf.forEach(s => {
    if (s.percentage < 95) {
      if (!stnLocoMap[s.stationId]) stnLocoMap[s.stationId] = { locoDetails: [], totalPerf: 0, count: 0 };
      stnLocoMap[s.stationId].locoDetails.push({
        id: s.locoId,
        perf: s.percentage,
        startTime: s.startTime,
        endTime: s.endTime
      });
      stnLocoMap[s.stationId].totalPerf += s.percentage;
      stnLocoMap[s.stationId].count++;
    }
  });

  const multiLocoBadStns = Object.entries(stnLocoMap)
    .filter(([, data]) => data.locoDetails.length > 1)
    .map(([stationId, data]) => ({
      stationId,
      locoCount: data.locoDetails.length,
      avgPerf: data.totalPerf / data.count,
      locoDetails: data.locoDetails
    }));

  const rfFiltered = rfData.filter(row => isValidLocoId(row[locoIdCol] || locoId));
  const totalExp = rfFiltered.reduce((acc, row) => acc + parseNumber(row[expectedCol]), 0);
  const totalRec = rfFiltered.reduce((acc, row) => acc + parseNumber(row[receivedCol]), 0);
  const locoPerformance = totalExp > 0 
    ? (totalRec / totalExp) * 100 
    : (stationStats.length > 0 ? stationStats.reduce((acc, s) => acc + s.percentage, 0) / stationStats.length : 0);

  // Radio Data Mapping
  const packetTypeCol = findColumn(firstRadio, 'Packet Type', 'PacketType', 'Type', 'Pkt Type2', 'PktType2') || 'Packet Type';
  const lengthCol = findColumn(firstRadio, 'Length', 'Len', 'Size') || 'Length';
  const sourceCol = findColumn(firstRadio, 'Source', 'Src', 'From') || 'Source';
  const messageCol = findColumn(firstRadio, 'Message', 'Msg', 'Data') || 'Message';

  const radioRadioCol = findColumn(firstRadio, 'Radio', 'Modem', 'RadioId', 'Radio_Id', 'ModemId', 'Modem_Id', 'Radio No', 'RadioNo', 'Radio_No') || (Object.keys(firstRadio).length > 29 ? Object.keys(firstRadio)[29] : 'Radio');

  const isMA = (val: any) => {
    const s = String(val || '').toLowerCase().replace(/\s/g, '');
    return s.includes('movementauthority') || s === 'ma' || s.includes('movauth') || s.includes('movementauth');
  };
  const isAR = (val: any) => {
    const s = String(val || '').toLowerCase().replace(/\s/g, '');
    return s.includes('accessrequest') || s === 'ar' || s.includes('accreq') || s.includes('accessreq');
  };

  let arCount = radioData.filter((p) => isAR(p[packetTypeCol])).length;
  const maPacketsRaw = radioData.filter((p) => isMA(p[packetTypeCol]));
  let maCount = maPacketsRaw.length;

  // Include packets from trnData if they exist there (e.g. ALL_TRNMSNMA files)
  if (trnData && trnData.length > 0) {
    const trnPacketTypeCol = findColumn(trnData[0], 'Pkt Type2', 'PktType2', 'Packet Type', 'PacketType', 'Type');
    if (trnPacketTypeCol) {
      const trnMaPackets = trnData.filter(p => isMA(p[trnPacketTypeCol]));
      const trnArPackets = trnData.filter(p => isAR(p[trnPacketTypeCol]));
      
      // Combine counts if they are likely from different sources or if one is empty
      // Usually TRN logs and Radio logs contain different aspects of the same communication
      // or represent different logs entirely.
      if (radioData.length === 0 || maCount === 0) {
        maCount = trnMaPackets.length;
      } else if (trnMaPackets.length > 0) {
        // If both have data, we might be double counting, but showing 0 is worse.
        // Let's take the maximum or sum? Sum is safer if they are separate logs.
        // The user specifically asked for these to be shown.
        maCount = Math.max(maCount, trnMaPackets.length);
      }

      if (radioData.length === 0 || arCount === 0) {
        arCount = trnArPackets.length;
      } else if (trnArPackets.length > 0) {
        arCount = Math.max(arCount, trnArPackets.length);
      }
    }
  }

  // Short Packets (< 10)
  const shortPackets = radioData
    .filter(p => Number(p[lengthCol]) < 10 && p[lengthCol] !== undefined && isValidLocoId(p[radioLocoIdCol] || locoId))
    .map(p => ({
      time: getRadioTime(p),
      type: String(p[packetTypeCol]),
      length: Number(p[lengthCol]),
      locoId: String(p[radioLocoIdCol] || locoId).trim(),
      radio: String(p[radioRadioCol] || '').trim()
    }));

  // SOS Events
  const sosEvents = radioData
    .filter(p => (String(p[packetTypeCol]).toLowerCase().includes('sos') || String(p[messageCol]).toLowerCase().includes('sos')) && isValidLocoId(p[radioLocoIdCol] || locoId))
    .map(p => ({
      time: getRadioTime(p),
      source: String(p[sourceCol] || 'Unknown'),
      type: String(p[packetTypeCol]),
      stationId: String(p[stnIdCol] || 'N/A'),
      locoId: String(p[radioLocoIdCol] || locoId).trim(),
      radio: String(p[radioRadioCol] || '').trim()
    }));

  // Tag Link Issues (Medha Specific)
  const tagLinkCol = findColumn(firstRadio, 'Tag Link Info', 'TagLinkInfo', 'TagInfo') || 'Tag Link Info';
  const radioTagIssues = radioData
    .filter(p => {
      const info = String(p[tagLinkCol] || '').toLowerCase();
      return info.includes('error') || 
             info.includes('mismatch') || 
             info.includes('wrong') || 
             info.includes('fail') ||
             info.includes('maintagmissing') ||
             info.includes('duplicatetagmissing');
    })
    .map(p => {
      const info = String(p[tagLinkCol]);
      let errorType = "Potential Medha Kavach Reporting Issue";
      if (info.toLowerCase().includes('maintagmissing')) errorType = "Main Tag Missing";
      if (info.toLowerCase().includes('duplicatetagmissing')) errorType = "Duplicate Tag Missing";
      
      return {
        time: getRadioTime(p),
        stationId: String(p[stnIdCol] || 'N/A'),
        info: info,
        error: errorType,
        locoId: String(p[radioLocoIdCol] || locoId).trim(),
        radio: String(p[radioRadioCol] || '').trim()
      };
    });

  // Also check TRNMSNMA for Tag Link Issues (User specified Column R)
  const trnTagIssues: any[] = [];
  if (trnData) {
    const firstTrn = trnData[0] || {};
    // Try to find column R (18th column) or a named column
    const trnKeys = Object.keys(firstTrn);
    const colR = trnKeys[17]; // Column R is index 17
    const trnTagLinkCol = findColumn(firstTrn, 'Tag Link Info', 'TagLinkInfo', 'TagInfo') || colR;

    trnData.forEach(row => {
      const info = String(row[trnTagLinkCol] || '').toLowerCase();
      if (info.includes('maintagmissing') || info.includes('duplicatetagmissing')) {
        let errorType = "Potential Medha Kavach Reporting Issue";
        if (info.includes('maintagmissing')) errorType = "Main Tag Missing";
        if (info.includes('duplicatetagmissing')) errorType = "Duplicate Tag Missing";

      trnTagIssues.push({
        time: getTrnTime(row),
        stationId: String(row[findColumn(row, 'Station Id', 'StationId', 'Station_Id') || ''] || 'N/A'),
        info: String(row[trnTagLinkCol]),
        error: errorType,
        locoId: String(row[trnLocoIdCol] || locoId).trim(),
        radio: String(row[trnRadioCol] || '').trim()
      });
      }
    });
  }

  const tagLinkIssues = [...radioTagIssues, ...trnTagIssues].sort((a, b) => a.time.localeCompare(b.time));

  // NMS Logic
  const nmsHealthCol = findColumn(firstTrn, 'NMS Health', 'NMSHealth', 'Health') || 'NMS Health';
  const modeCol = findColumn(firstTrn, 'Mode', 'CurrentMode', 'OpMode') || trnKeys[14] || 'Mode';
  const eventCol = findColumn(firstTrn, 'Event', 'Description', 'LogEntry') || 'Event';
  const reasonCol = findColumn(firstTrn, 'Reason', 'Cause', 'FaultReason') || 'Reason';
  const lpResponseCol = findColumn(firstTrn, 'LP Response', 'DriverAction', 'Response', 'Acknowledge', 'Pilot Ack') || trnKeys[23] || 'LP Response';
  const speedCol = findColumn(firstTrn, 'Speed', 'Velocity', 'Kmph') || 'Speed';
  const locationCol = findColumn(firstTrn, 'Location', 'Km', 'Position') || 'Location';
  const signalIdCol = findColumn(firstTrn, 'Signal Id', 'SignalId', 'SigId') || 'Signal Id';
  const signalStatusCol = findColumn(firstTrn, 'Signal Status', 'SignalStatus', 'SigStatus') || 'Signal Status';

  const nmsFailRate = trnData
    ? (trnData.filter((row) => {
        const val = String(row[nmsHealthCol] || '').toLowerCase().trim();
        // Inclusive healthy check: 0 is standard, but handle common variations
        const isHealthy = val === '0' || val === 'healthy' || val === 'ok';
        return !isHealthy && isValidLocoId(row[trnLocoIdCol] || locoId);
      }).length / 
       (trnData.filter(row => isValidLocoId(row[trnLocoIdCol] || locoId)).length || 1)) * 100
    : 0;

  const nmsStatusMap: Record<string, number> = {};
  const locoNmsData: Record<string, { total: number; errors: number }> = {};

  trnData?.forEach((row) => {
    if (!isValidLocoId(row[trnLocoIdCol] || locoId)) return;
    
    let status = String(row[nmsHealthCol] || 'Unknown').trim();
    if (status === '0') status = '0 (Healthy)';
    nmsStatusMap[status] = (nmsStatusMap[status] || 0) + 1;

    const lId = String(row[trnLocoIdCol] || locoId).trim();
    if (!locoNmsData[lId]) locoNmsData[lId] = { total: 0, errors: 0 };
    locoNmsData[lId].total++;
    
    const val = status.toLowerCase();
    if (val !== '0 (healthy)' && val !== 'healthy' && val !== 'ok') {
      locoNmsData[lId].errors++;
    }
  });

  const nmsLocoStats = Object.entries(locoNmsData).map(([lId, data]) => {
    const perc = data.total > 0 ? (data.errors / data.total) * 100 : 0;
    let category = 'Healthy';
    if (perc > 20) category = 'Critical / Very High';
    else if (perc > 10) category = 'High';
    
    return {
      locoId: lId,
      totalRecords: data.total,
      errors: data.errors,
      errorPercentage: Number(perc.toFixed(1)),
      category
    };
  }).sort((a, b) => b.errorPercentage - a.errorPercentage);

  const nmsStatus = Object.entries(nmsStatusMap).map(([name, value]) => ({ name, value }));
  const nmsLogs = trnData?.map(row => ({
    time: getTrnTime(row),
    health: String(row[nmsHealthCol]),
    locoId: String(row[trnLocoIdCol] || locoId).trim()
  })) || [];

  const nmsDeepAnalysis: DashboardStats['nmsDeepAnalysis'] = [];
  let currentNmsEvent: any = null;

  trnData?.forEach((row) => {
    if (!isValidLocoId(row[trnLocoIdCol] || locoId)) return;
    
    const status = String(row[nmsHealthCol] || '').trim();
    const lId = String(row[trnLocoIdCol] || locoId).trim();
    const stnId = String(row[findColumn(row, 'Station Id', 'StationId', 'Station_Id') || ''] || 'N/A');
    const time = getTrnTime(row);

    if (status === '0' || status === 'healthy' || status === 'ok' || status === '') {
      if (currentNmsEvent && currentNmsEvent.locoId === lId) {
        nmsDeepAnalysis.push(currentNmsEvent);
        currentNmsEvent = null;
      }
      return;
    }
    
    // It's an error.
    if (currentNmsEvent && currentNmsEvent.locoId === lId && currentNmsEvent.errorCode === status && currentNmsEvent.stationId === stnId) {
      currentNmsEvent.count++;
      currentNmsEvent.endTime = time;
    } else {
      if (currentNmsEvent && currentNmsEvent.locoId === lId) {
        nmsDeepAnalysis.push(currentNmsEvent);
      }
      
      let errorType = 'Unknown Error';
      let description = '';
      let source: 'Loco' | 'Station' | 'Unknown' = 'Loco'; // NMS is mostly Loco Vital Computer health
      
      if (status === '8') {
        errorType = 'Sub-system Error';
        description = 'Minor delay/failure in hardware module (e.g., BIU Interface, RFID Reader, Speed Sensor).';
      } else if (status === '1') {
        errorType = 'Communication Error';
        description = 'Interruption in internal communication between the processor and its sub-units.';
      } else if (['16', '32', '40', '48'].includes(status)) {
        errorType = 'Vital Hardware Error';
        description = 'Mismatch in redundant processor or loss of synchronization with Brake Interface Unit (BIU).';
      } else {
        errorType = `Error Code ${status}`;
        description = 'Self-diagnosis reported a non-zero health status requiring servicing.';
      }

      const stnNameCol = findColumn(row, 'Station Name', 'StationName', 'Station_Name');
      const stnName = stnNameCol ? String(row[stnNameCol] || '').trim() : String(row[trnKeys[2]] || '').trim();

      currentNmsEvent = {
        locoId: lId,
        stationId: stnId,
        stationName: stnName,
        startTime: time,
        endTime: time,
        count: 1,
        errorCode: status,
        errorType,
        description,
        source
      };
    }
  });
  if (currentNmsEvent) {
    nmsDeepAnalysis.push(currentNmsEvent);
  }
  
  // Sort by count descending to show the most critical continuous errors first
  nmsDeepAnalysis.sort((a, b) => b.count - a.count);

  // Mode Degradation
  const modeDegradations: DashboardStats['modeDegradations'] = [];
  let lastMode: string | null = null;
  let lastAck: string | null = null;

  const modePriority: Record<string, number> = {
    'FS': 5,
    'OS': 4,
    'PS': 3,
    'SR': 2,
    'SH': 1,
    'IS': 0,
    'TR': -1,
    'Unknown': 10 // High priority to avoid false positives on first row
  };
  
  trnData?.forEach((row) => {
    const rawMode = String(row[modeCol] || '').trim();
    const currentAck = String(row[lpResponseCol] || '').trim();
    const event = String(row[eventCol] || '').toLowerCase();
    
    // Normalize mode names for detection
    let currentMode = rawMode;
    const upperRaw = rawMode.toUpperCase();
    if (upperRaw.includes('STAFF') || upperRaw === 'SR') currentMode = 'SR';
    else if (upperRaw.includes('FULL') || upperRaw === 'FS') currentMode = 'FS';
    else if (upperRaw.includes('SIGHT') || upperRaw === 'OS') currentMode = 'OS';
    else if (upperRaw.includes('SHUNT') || upperRaw === 'SH') currentMode = 'SH';
    else if (upperRaw.includes('TRIP') || upperRaw === 'TR') currentMode = 'TR';
    else if (upperRaw.includes('PARTIAL') || upperRaw === 'PS') currentMode = 'PS';
    else if (upperRaw.includes('ISOLATION') || upperRaw === 'IS') currentMode = 'IS';
    
    if (currentMode) {
      const isDegradationMessage = currentAck.toLowerCase().includes('to_sr') || 
                                   currentAck.toLowerCase().includes('to_os') ||
                                   currentAck.toLowerCase().includes('degrad');
                                   
      const modeChanged = lastMode && currentMode !== lastMode;
      const ackChanged = lastAck && currentAck !== lastAck;
      
      // If it's the first row and it's already in a degraded state with a message, count it
      const isFirstRowDegraded = !lastMode && (currentMode === 'SR' || currentMode === 'OS' || currentMode === 'SH') && isDegradationMessage;

      if (modeChanged || ackChanged || isFirstRowDegraded) {
        // A true degradation is moving down the priority hierarchy
        const lastPrio = lastMode ? (modePriority[lastMode] ?? 5) : 5;
        const currPrio = modePriority[currentMode] ?? 5;
        
        const isTrueDegradation = currPrio < lastPrio;
        
        // Or if the Pilot Ack explicitly says "degrad" or the event says so
        const isExplicitDegradation = isDegradationMessage || event.includes('degrad');
                              
        if (isTrueDegradation || isExplicitDegradation) {
          // Skip normal startup sequence: SR -> OS -> FS is an upgrade, so it's already skipped by prio check.
          // However, we also want to avoid any "degradation" that is just the system settling into SR/OS at the very start.
          
          // Extract a meaningful reason
          let reason = String(row[reasonCol] || '').trim();
          if (!reason || reason === 'N/A' || reason === '0') {
            reason = String(row[eventCol] || '').trim();
          }
          if (!reason || reason === 'N/A' || reason === '0') {
            reason = currentAck || 'Mode Change';
          }

          const time = getTrnTime(row);
          const locoIdVal = String(row[trnLocoIdCol] || locoId).trim();

          // DYNAMIC ANALYSIS: Correlate with Radio Packet Loss if possible
          // This will be refined after radio packets are processed
          const stnNameCol = findColumn(row, 'Station Name', 'StationName', 'Station_Name');
          const stnName = stnNameCol ? String(row[stnNameCol] || '').trim() : String(row[trnKeys[2]] || '').trim();

          modeDegradations.push({
            time,
            from: lastMode || (isDegradationMessage && currentAck.includes('FS_to') ? 'FS' : 'Unknown'),
            to: currentMode,
            reason: reason,
            lpResponse: currentAck,
            stationId: String(row[findColumn(row, 'Station Id', 'StationId', 'Station_Id') || ''] || 'N/A'),
            stationName: stnName,
            locoId: locoIdVal,
            radio: String(row[trnRadioCol] || '').trim()
          });
        }
      }
      lastMode = currentMode;
      lastAck = currentAck;
    }
  });

  // Brake Applications
  const brakeApplications = trnData
    ?.filter(row => {
      const event = String(row[eventCol] || '').toLowerCase();
      const hasBrake = event.includes('brake') || event.includes('eb applied') || event.includes('sb applied');
      return hasBrake && isValidLocoId(row[trnLocoIdCol] || locoId);
    })
    .map(row => ({
      time: getTrnTime(row),
      type: String(row[eventCol]),
      speed: Number(row[speedCol]) || 0,
      location: String(row[locationCol] || 'N/A'),
      stationId: String(row[findColumn(row, 'Station Id', 'StationId', 'Station_Id') || ''] || 'N/A'),
      locoId: String(row[trnLocoIdCol] || locoId).trim(),
      radio: String(row[trnRadioCol] || '').trim()
    })) || [];

  // Signal Overrides
  const signalOverrides = trnData
    ?.filter(row => String(row[eventCol] || '').toLowerCase().includes('override') && isValidLocoId(row[trnLocoIdCol] || locoId))
    .map(row => ({
      time: getTrnTime(row),
      signalId: String(row[signalIdCol] || 'N/A'),
      status: String(row[signalStatusCol] || 'Overridden'),
      stationId: String(row[findColumn(row, 'Station Id', 'StationId', 'Station_Id') || ''] || 'N/A'),
      locoId: String(row[trnLocoIdCol] || locoId).trim(),
      radio: String(row[trnRadioCol] || '').trim()
    })) || [];

  // Train Config Changes
  const trainConfigChanges: DashboardStats['trainConfigChanges'] = [];
  const configParams = ['Train Length', 'Loco Id', 'Train Id', 'TrainLength', 'LocoId', 'TrainId', 'Length'];
  const uniqueTrainLengthsMap = new Map<number, { time: string; stationId: string }>();
  let lastConfig: Record<string, string> = {};
  
  trnData?.forEach(row => {
    const rowStnId = String(row[findColumn(row, 'Station Id', 'StationId', 'Station_Id') || ''] || 'N/A');
    configParams.forEach(param => {
      const col = findColumn(row, param);
      if (col) {
        const val = String(row[col]);
        if (param.toLowerCase().includes('length')) {
          const numLen = Number(val);
          if (!isNaN(numLen) && numLen > 0) {
            if (!uniqueTrainLengthsMap.has(numLen)) {
              uniqueTrainLengthsMap.set(numLen, { 
                time: getTrnTime(row), 
                stationId: rowStnId 
              });
            }
          }
        }
        if (lastConfig[param] && lastConfig[param] !== val) {
          trainConfigChanges.push({
          time: getTrnTime(row),
          parameter: param,
          oldVal: lastConfig[param],
          newVal: val,
          stationId: rowStnId,
          locoId: String(row[trnLocoIdCol] || locoId).trim(),
          radio: String(row[trnRadioCol] || '').trim()
        });
        }
        lastConfig[param] = val;
      }
    });
  });

  const uniqueTrainLengths = Array.from(uniqueTrainLengthsMap.entries())
    .map(([length, info]) => ({ length, ...info, locoId: String(locoId).trim(), radio: '' })) // Simplified radio for train lengths
    .sort((a, b) => a.length - b.length);

  // Station Radio Packets (Columns AD to BF - Index 29 to 57)
  const stationRadioPackets: DashboardStats['stationRadioPackets'] = [];
  if (trnData && trnData.length > 0) {
    const trnKeys = Object.keys(trnData[0]);
    trnData.forEach(row => {
      const packets: { [key: string]: any } = {};
      // AD is index 29, BF is index 57
      for (let i = 29; i <= 57; i++) {
        const key = trnKeys[i];
        if (key && row[key] !== undefined && row[key] !== null && row[key] !== '') {
          packets[key] = row[key];
        }
      }
      
      if (Object.keys(packets).length > 0) {
        stationRadioPackets.push({
          time: getTrnTime(row),
          stationId: String(row[findColumn(row, 'Station Id', 'StationId', 'Station_Id') || ''] || 'N/A'),
          packets,
          locoId: String(row[trnLocoIdCol] || locoId).trim()
        });
      }
    });
  }

  // Sync/Lag Logic
  const maPacketsProcessed: { time: string; delay: number; category: string; length: number; locoId: string | number }[] = [];
  let lastTime: number | null = null;

  if (radioData.length > 0) {
    maPacketsRaw.forEach((p, i) => {
      const currentTime = parseTime(p[radioTimeCol]);
      const rowLocoId = p[radioLocoIdCol] || locoId;
      if (i > 0 && lastTime !== null && !isNaN(currentTime) && isValidLocoId(rowLocoId)) {
        const delay = (currentTime - lastTime) / 1000;
        if (delay >= 0 && delay < 300) { // Ignore gaps > 5 mins as they are log gaps, not operational lag
          maPacketsProcessed.push({
            time: getRadioTime(p),
            delay: Math.min(delay, 60), // Cap at 60s for diagnostic display to avoid unrealistic numbers
            category: bucketDelay(delay),
            length: Number(p[lengthCol]) || 0,
            locoId: String(rowLocoId).trim()
          });
        }
      }
      lastTime = currentTime;
    });
  } else if (trnData && trnData.length > 0) {
    const trnPacketTypeCol = findColumn(trnData[0], 'Pkt Type2', 'PktType2', 'Packet Type', 'PacketType', 'Type');
    const trnMaPackets = trnPacketTypeCol ? trnData.filter(p => {
      const s = String(p[trnPacketTypeCol] || '').toLowerCase().replace(/\s/g, '');
      return s.includes('movementauthority') || s === 'ma' || s.includes('movauth') || s.includes('movementauth');
    }) : [];
    
    if (trnMaPackets.length > 0) {
      // Use explicit MA packets from TRN log
      let lastMaTime: number | null = null;
      trnMaPackets.forEach((p, i) => {
        const currentTime = parseTime(getTrnTime(p));
        if (i > 0 && lastMaTime !== null && !isNaN(currentTime)) {
          const delay = (currentTime - lastMaTime) / 1000;
          if (delay >= 0 && delay < 300) {
            maPacketsProcessed.push({
              time: getTrnTime(p),
              delay: Math.min(delay, 60),
              category: bucketDelay(delay),
              length: 0,
              locoId: String(p[trnLocoIdCol] || locoId).trim()
            });
          }
        }
        lastMaTime = currentTime;
      });
    } else {
      // FALLBACK: If no radio log and no explicit MA packets, use TRN log's radio columns (AD-BF) to detect delays
      // We look for changes in any of the radio packet columns
      let lastRadioState: string = '';
      let lastRadioTime: number | null = null;
      const trnKeys = Object.keys(trnData[0]);
      
      trnData.forEach((row, i) => {
        const currentTime = parseTime(getTrnTime(row));
        if (isNaN(currentTime)) return;

        // Concatenate values of radio columns to detect any change
        let currentRadioState = '';
        for (let j = 29; j <= 57; j++) {
          const key = trnKeys[j];
          if (key) currentRadioState += String(row[key] || '');
        }

        if (i === 0) {
          lastRadioState = currentRadioState;
          lastRadioTime = currentTime;
          return;
        }

        // If radio state changed, it means a new packet was received
        if (currentRadioState !== lastRadioState && currentRadioState.replace(/0/g, '').length > 0) {
          if (lastRadioTime !== null) {
            const delay = (currentTime - lastRadioTime) / 1000;
            if (delay > 0.5 && delay < 300) { // Only record significant operational delays
              maPacketsProcessed.push({
                time: getTrnTime(row),
                delay: Math.min(delay, 60),
                category: bucketDelay(delay),
                length: 0,
                locoId: String(row[trnLocoIdCol] || locoId).trim()
              });
            }
          }
          lastRadioState = currentRadioState;
          lastRadioTime = currentTime;
        } else if (lastRadioTime !== null) {
          // If state hasn't changed, check if we've been waiting too long
          const currentDelay = (currentTime - lastRadioTime) / 1000;
          if (currentDelay > 2 && currentDelay < 300) {
            // Record a "virtual" packet loss event
            maPacketsProcessed.push({
              time: getTrnTime(row),
              delay: Math.min(currentDelay, 60),
              category: bucketDelay(currentDelay),
              length: 0,
              locoId: String(row[trnLocoIdCol] || locoId).trim()
            });
          }
        }
      });
    }
  }

  // DYNAMIC CORRELATION: Update mode degradation reasons based on radio packet loss
  modeDegradations.forEach(deg => {
    const degTime = parseTime(deg.time);
    if (isNaN(degTime)) return;

    // Look for radio packet timeouts (> 2s) within 10 seconds before the degradation
    const recentTimeouts = maPacketsProcessed.filter(p => {
      const pTime = parseTime(p.time);
      return !isNaN(pTime) && pTime <= degTime && pTime >= degTime - 10000 && p.delay > 2;
    });

    // Also check NMS Health in the same window
    const recentNmsIssues = nmsLogs.filter(p => {
      const pTime = parseTime(p.time);
      const health = parseInt(p.health);
      return !isNaN(pTime) && pTime <= degTime && pTime >= degTime - 10000 && health !== 32 && health !== 0;
    });

    if (recentTimeouts.length > 0 || recentNmsIssues.length > 0) {
      let maxDelay = 0;
      if (recentTimeouts.length > 0) {
        maxDelay = Math.max(...recentTimeouts.map(p => p.delay));
      } else {
        // If we have NMS issues but no explicit delay recorded, assume at least 2s based on NMS timeout
        maxDelay = 2.0;
      }
      
      const radioInfo = `Radio Packet Loss (Max Delay: ${maxDelay.toFixed(1)}s)`;
      
      // Avoid redundancy if the reason already mentions radio loss
      if (!deg.reason.toLowerCase().includes('radio') && !deg.reason.toLowerCase().includes('packet')) {
        deg.reason = `${radioInfo} - ${deg.reason}`;
      } else if (!deg.reason.includes('Max Delay')) {
        // If it mentions radio but not the delay, add the delay
        deg.reason = `${radioInfo} - ${deg.reason.replace(/radio\s*packet\s*loss/gi, '').replace(/^[\s-]+|[\s-]+$/g, '') || deg.reason}`;
      }
    }

    // Also check RF Signal Strength (Train-side)
    const recentRfDrops = rfData.filter(p => {
      const pTime = parseTime(getRfTime(p));
      const perc = Number(p[percentageCol]) || 0;
      return !isNaN(pTime) && pTime <= degTime && pTime >= degTime - 10000 && perc < 80;
    });

    if (recentRfDrops.length > 0 && !deg.reason.includes('Radio Packet Loss') && !deg.reason.includes('Poor RF Signal')) {
      const minPerc = Math.min(...recentRfDrops.map(p => Number(p[percentageCol]) || 100));
      deg.reason = `Poor RF Signal (${minPerc.toFixed(1)}%) - ${deg.reason}`;
    }
  });

  const avgLag = maPacketsProcessed.length > 0
    ? maPacketsProcessed.reduce((a, b) => a + b.delay, 0) / maPacketsProcessed.length
    : 0;

  // Interval Distribution
  const categoryCounts: Record<string, number> = {
    "<= 1s (Normal)": 0,
    "1s - 2s (Delayed)": 0,
    "> 2s (Timeout)": 0,
  };
  maPacketsProcessed.forEach((p) => {
    categoryCounts[p.category]++;
  });

  const totalProcessed = maPacketsProcessed.length || 1;
  const intervalDist = Object.entries(categoryCounts).map(([category, count]) => ({
    category,
    percentage: (count / totalProcessed) * 100,
  }));

  // Dynamic Diagnostic Advice
  const diagnosticAdvice: DashboardStats['diagnosticAdvice'] = [];

  if (nmsFailRate > 10) {
    diagnosticAdvice.push({
      title: "NMS Health Critical Failure",
      detail: `NMS Health failure rate is ${nmsFailRate.toFixed(1)}%. The NMS Health column should ideally maintain a value of 0 (Healthy). Your data contains anomalous values in ${nmsFailRate.toFixed(1)}% of rows, indicating persistent hardware or internal communication issues.`,
      action: "Test: Check Loco Vital Computer (LVC) logs for specific card failures (e.g., BIU Interface, RFID Reader). Check: Internal communication links and redundant processor synchronization.",
      severity: 'high'
    });
  }

  if (maCount < arCount * 0.5) {
    diagnosticAdvice.push({
      title: "Critical Session Instability",
      detail: `System is sending ${arCount} Access Requests but only receiving ${maCount} Movement Authorities.`,
      action: "Test: RF Signal Strength (RSSI) measurement. Check: Radio Modem, Antenna alignment, and RF Surge Arrestors.",
      severity: 'high'
    });
  }

  if (avgLag > 1.2) {
    diagnosticAdvice.push({
      title: "Packet Refresh Lag Detected",
      detail: `Average MA packet interval is ${avgLag.toFixed(2)}s (Standard requirement is 1.0s).`,
      action: "Test: Radio Latency Test. Check: Station TCAS CPU load, Radio modem serial baud rate, and RF interference.",
      severity: 'medium'
    });
  }

  if (badStns.length > 0) {
    const formattedBadStns = badStns.map(id => formatStationName(stationMap[id] || String(id)));
    diagnosticAdvice.push({
      title: "Station Hardware Marginal Performance",
      detail: `Stations ${formattedBadStns.join(', ')} are performing below the 95% efficiency threshold.`,
      action: `Audit the track-side Kavach equipment and signal strength at stations [${formattedBadStns.join(', ')}] to resolve the localized communication drops.`,
      severity: 'medium'
    });
  }

  if (modeDegradations.length > 0) {
    const radioRelated = modeDegradations.filter(d => d.reason.includes('Radio Packet Loss'));
    const rfRelated = modeDegradations.filter(d => d.reason.includes('Poor RF Signal'));
    
    const getAffectedStns = (list: any[]) => {
      const stns = Array.from(new Set(list.map(d => {
        const id = d.stationId;
        if (!id || id === 'N/A') return null;
        const name = d.stationName || stationMap[id] || String(id);
        return formatStationName(name);
      }).filter(s => s !== null)));
      return stns.length > 0 ? ` at Stations: ${stns.join(', ')}` : '';
    };

    if (radioRelated.length > 0) {
      diagnosticAdvice.push({
        title: "Radio Packet Loss causing Mode Degradation",
        detail: `${radioRelated.length} mode degradation events were directly correlated with radio packet timeouts (> 2s)${getAffectedStns(radioRelated)}.`,
        action: "Check: Radio modem power stability, antenna VSWR, and potential RF interference in the section.",
        severity: 'high'
      });
    } else if (rfRelated.length > 0) {
      diagnosticAdvice.push({
        title: "Poor RF Signal causing Mode Degradation",
        detail: `${rfRelated.length} mode degradation events were correlated with low RF signal strength (< 80%)${getAffectedStns(rfRelated)}.`,
        action: "Check: Antenna alignment, RF cable health, and signal coverage in the affected station areas.",
        severity: 'high'
      });
    } else {
      diagnosticAdvice.push({
        title: "Mode Degradation Events Detected",
        detail: `${modeDegradations.length} mode degradation events were recorded in the TRNMSNMA logs${getAffectedStns(modeDegradations)}.`,
        action: "Check: LP Response times, NMS Health correlation, and Radio MA lag at the time of degradation.",
        severity: 'high'
      });
    }
  }

  if (diagnosticAdvice.length === 0) {
    diagnosticAdvice.push({
      title: "System Healthy",
      detail: "All parameters are within normal RDSO limits.",
      action: "Routine: Perform weekly visual inspection of all RF connectors and ensure all modules are properly seated.",
      severity: 'low'
    });
  }

  // Time Range Logic
  const allTimes: string[] = [];
  rfData.forEach(p => { 
    const rowTime = getRfTime(p);
    if (rowTime !== 'N/A') allTimes.push(rowTime); 
  });
  radioData.forEach(p => { if (p[radioTimeCol]) allTimes.push(String(p[radioTimeCol])); });
  trnData?.forEach(row => { if (row[trnTimeCol]) allTimes.push(String(row[trnTimeCol])); });
  
  // Sort times numerically to find accurate range
  allTimes.sort((a, b) => {
    const ta = parseTime(a);
    const tb = parseTime(b);
    if (isNaN(ta) && isNaN(tb)) return 0;
    if (isNaN(ta)) return 1;
    if (isNaN(tb)) return -1;
    return ta - tb;
  });
  
  const startTime = allTimes.length > 0 ? allTimes[0] : 'N/A';
  const endTime = allTimes.length > 0 ? allTimes[allTimes.length - 1] : 'N/A';

  const allDatesSet = new Set<string>();
  rfData.forEach(row => {
    const d = row._extractedDate || (rfDateCol && row[rfDateCol]);
    if (d) allDatesSet.add(String(d).trim());
  });
  trnData?.forEach(row => {
    const d = row._extractedDate || (trnDateCol && row[trnDateCol]);
    if (d) allDatesSet.add(String(d).trim());
  });
  radioData.forEach(row => {
    const d = row._extractedDate || (radioDateCol && row[radioDateCol]);
    if (d) allDatesSet.add(String(d).trim());
  });

  // Sort dates chronologically
  const allDates = Array.from(allDatesSet).sort((a, b) => parseDateString(a) - parseDateString(b));

  const logDate = allDates.length > 0 ? allDates[0] : null;

  // --- Station Radio Deep Analysis Logic ---
  const stationFailures: Record<string | number, { count: number; totalDuration: number; locos: Set<string | number>; totalEvents: number; workingEvents: number }> = {};
  const locoFailures: Record<string | number, { count: number; stations: Set<string | number> }> = {};
  const criticalEvents: DashboardStats['stationDeepAnalysis']['criticalEvents'] = [];

  const getReason = (loss: any) => {
    if (loss.duration > 120) return "Environmental (Signal Shadow / Terrain)";
    if (loss.minPerc > 0 && loss.minPerc < 30) return "Signal Interference / Fading";
    if (loss.minPerc === 0) return "Hardware (Total Signal Loss)";
    if (loss.duration < 10) return "Software / Protocol Lag";
    return "Environmental / Interference";
  };

  // Identify RF Loss Events from both rfData and rfStData
  const combinedRf = [
    ...rfData.map(r => ({ ...r, _source: 'train' })),
    ...rfStData.map(r => ({ ...r, _source: 'station' }))
  ];
  const sortedRf = combinedRf.sort((a, b) => getRfTimestamp(a) - getRfTimestamp(b));
  let currentLoss: any = null;

  sortedRf.forEach((row) => {
    const stnId = row[stnIdCol];
    const stnName = String(row[stnNameCol] || stationMap[stnId] || '').trim();
    const rawRowLocoId = row[locoIdCol] || locoId;
    if (!isValidLocoId(rawRowLocoId) || !isValidStationId(stnId)) return;
    const rowLocoId = String(rawRowLocoId).trim();
    const received = Number(row[receivedCol]) || 0;
    const expected = Number(row[expectedCol]) || 0;
    const percentage = Number(row[percentageCol]) || 0;
    const timestamp = getRfTimestamp(row);
    const radio = String(row[radioCol] || 'Radio 1').trim();
    const source = row._source;

    if (!stationFailures[stnId]) {
      stationFailures[stnId] = { count: 0, totalDuration: 0, locos: new Set(), totalEvents: 0, workingEvents: 0 };
    }
    stationFailures[stnId].totalEvents++;
    if (percentage >= 95) stationFailures[stnId].workingEvents++;

    const isLoss = percentage < 50 || (expected > 0 && received === 0);

    if (isLoss) {
      stationFailures[stnId].count++;
      stationFailures[stnId].locos.add(rowLocoId);
      
      if (!locoFailures[rowLocoId]) {
        locoFailures[rowLocoId] = { count: 0, stations: new Set() };
      }
      locoFailures[rowLocoId].count++;
      locoFailures[rowLocoId].stations.add(stnId);

      // Aggregate consecutive losses (within 2 minutes)
      if (currentLoss && currentLoss.locoId === rowLocoId && currentLoss.stationId === stnId && currentLoss.radio === radio && (timestamp - currentLoss.endTime) < 120000) {
        currentLoss.endTime = timestamp;
        currentLoss.minPerc = Math.min(currentLoss.minPerc, percentage);
      } else {
        if (currentLoss) {
          const duration = Math.round((currentLoss.endTime - currentLoss.startTime) / 1000) || 30;
          const reason = getReason({ ...currentLoss, duration });
          criticalEvents.push({
            time: new Date(currentLoss.startTime).toLocaleTimeString(),
            stationId: (currentLoss.stationId === 'N/A' || currentLoss.stationId === '-') ? '' : String(currentLoss.stationId),
            stationName: (currentLoss.stationName === 'N/A' || currentLoss.stationName === '-') ? '' : currentLoss.stationName,
            locoId: currentLoss.locoId,
            duration,
            type: 'Radio Loss',
            description: `Radio Loss (${currentLoss.minPerc}%) for ${duration}s at ${formatStationName(currentLoss.stationName || currentLoss.stationId)} (${currentLoss.source === 'train' ? 'Train Side' : 'Station Side'})`,
            radio: currentLoss.radio,
            reason
          });
        }
        currentLoss = {
          locoId: rowLocoId,
          stationId: stnId,
          stationName: stnName,
          startTime: timestamp,
          endTime: timestamp,
          radio,
          minPerc: percentage,
          source
        };
      }
      stationFailures[stnId].totalDuration += 30;
    } else {
      if (currentLoss) {
        const duration = Math.round((currentLoss.endTime - currentLoss.startTime) / 1000) || 30;
        const reason = getReason({ ...currentLoss, duration });
        criticalEvents.push({
          time: new Date(currentLoss.startTime).toLocaleTimeString(),
          stationId: (currentLoss.stationId === 'N/A' || currentLoss.stationId === '-') ? '' : String(currentLoss.stationId),
          stationName: (currentLoss.stationName === 'N/A' || currentLoss.stationName === '-') ? '' : currentLoss.stationName,
          locoId: currentLoss.locoId,
          duration,
          type: 'Radio Loss',
          description: `Radio Loss (${currentLoss.minPerc}%) for ${duration}s at ${formatStationName(currentLoss.stationName || currentLoss.stationId)} (${currentLoss.source === 'train' ? 'Train Side' : 'Station Side'})`,
          radio: currentLoss.radio,
          reason
        });
        currentLoss = null;
      }
    }
  });
  if (currentLoss) {
    const duration = Math.round((currentLoss.endTime - currentLoss.startTime) / 1000) || 30;
    const reason = getReason({ ...currentLoss, duration });
    criticalEvents.push({
      time: new Date(currentLoss.startTime).toLocaleTimeString(),
      stationId: (currentLoss.stationId === 'N/A' || currentLoss.stationId === '-') ? '' : String(currentLoss.stationId),
      stationName: (currentLoss.stationName === 'N/A' || currentLoss.stationName === '-') ? '' : currentLoss.stationName,
      locoId: currentLoss.locoId,
      duration,
      type: 'Radio Loss',
      description: `Radio Loss (${currentLoss.minPerc}%) for ${duration}s at ${formatStationName(currentLoss.stationName || currentLoss.stationId)} (${currentLoss.source === 'train' ? 'Train Side' : 'Station Side'})`,
      radio: currentLoss.radio,
      reason
    });
  }

  // FALLBACK: Detect Radio Loss from trnData if rfData is empty or as additional source
  if (trnData && trnData.length > 0) {
    let lastRadioTime: number | null = null;
    let lastRadioState: string = '';
    const trnKeys = Object.keys(trnData[0]);
    
    trnData.forEach((row, i) => {
      const currentTime = parseTime(getTrnTime(row));
      if (isNaN(currentTime)) return;

      // Detect radio state from Column E (loco radio) and Column AD (station radio)
      // and other radio packet columns (AD-BF)
      let currentRadioState = '';
      for (let j = 29; j <= 57; j++) {
        const key = trnKeys[j];
        if (key) currentRadioState += String(row[key] || '');
      }
      // Also include Column E (Loco Radio)
      const locoRadio = String(row[trnRadioCol] || '').trim();
      currentRadioState += locoRadio;

      if (i === 0) {
        lastRadioState = currentRadioState;
        lastRadioTime = currentTime;
        return;
      }

      const isRadioActive = currentRadioState.replace(/0/g, '').length > 0;

      // If radio state changed, it means a new packet was received
      if (isRadioActive && currentRadioState !== lastRadioState) {
        if (lastRadioTime !== null) {
          const duration = (currentTime - lastRadioTime) / 1000;
          // If duration > 5s, record it as a radio loss event if it's not already covered by rfData
          if (duration > 5 && duration < 300) {
            const timeStr = getTrnTime(row);
            // Check if we already have a similar event from rfData
            const exists = criticalEvents.some(e => e.time === timeStr && e.type === 'Radio Loss');
            
            if (!exists) {
              let stnName = String(row[trnKeys[2]] || row[trnKeys[32]] || row[trnKeys[1]] || row[trnKeys[3]] || row[trnKeys[31]] || '').trim();
              const locoNo = getBestLocoIdFromRow(row, trnKeys, locoId);
              let stnId = String(row[findColumn(row, 'Station Id', 'StationId', 'Station_Id') || ''] || 'N/A');

              // If station info is missing, try to find it from RF data near this time
              if ((!stnName || stnName === 'N/A' || stnName === '-') && (!stnId || stnId === 'N/A' || stnId === '-')) {
                const nearestRf = rfData.find(r => {
                  const rfTime = parseTime(getRadioTime(r));
                  return Math.abs(rfTime - currentTime) < 30000; // Within 30s
                });
                if (nearestRf) {
                  stnName = String(nearestRf[stnNameCol] || '').trim();
                  stnId = String(nearestRf[stnIdCol] || '').trim();
                }
              }

              // If we have an ID but no name, try the map
              if (stnId && stnId !== 'N/A' && stnId !== '-' && (!stnName || stnName === 'N/A' || stnName === '-')) {
                stnName = stationMap[stnId] || '';
              }

              criticalEvents.push({
                time: timeStr,
                stationId: (stnId === 'N/A' || stnId === '-') ? '' : stnId,
                stationName: (stnName === 'N/A' || stnName === '-') ? '' : stnName,
                locoId: locoNo,
                duration: Math.round(duration),
                type: 'Radio Loss',
                description: `Radio Loss detected from TRN log (Gap: ${Math.round(duration)}s)${stnName && stnName !== 'N/A' && stnName !== '-' ? ' at ' + stnName : ''}`,
                radio: locoRadio || 'Radio 1',
                reason: getReason({ duration: Math.round(duration), minPerc: 0 }) // TRN log loss is usually total loss
              });
            }
          }
        }
        lastRadioState = currentRadioState;
        lastRadioTime = currentTime;
      }
    });
  }

  // Time-based Analysis: Check for multiple trains at same time
  const timeMap: Record<string, Set<string | number>> = {};
  rfData.forEach(row => {
    const time = getRfTime(row);
    const percentage = Number(row[percentageCol]) || 0;
    const stnId = row[stnIdCol];
    if (percentage < 50 && time !== 'N/A') {
      const key = `${time}|${stnId}`;
      if (!timeMap[key]) timeMap[key] = new Set();
      timeMap[key].add(row[locoIdCol] || locoId);
    }
  });

  Object.entries(timeMap).forEach(([key, locos]) => {
    if (locos.size > 1) {
      const [time, stnId] = key.split('|');
      criticalEvents.push({
        time,
        stationId: (stnId === 'N/A' || stnId === '-') ? '' : stnId,
        locoId: 'Multiple',
        duration: 0,
        type: 'Multiple Trains Affected',
        description: `${locos.size} trains affected at ${formatStationName(stnId)} simultaneously`,
        reason: "Station Side / Environmental"
      });
    }
  });

  const topFaultyStations = Object.entries(stationFailures)
    .map(([stnId, data]) => {
      const healthScore = (data.workingEvents / (data.totalEvents || 1)) * 100;
      return {
        stationId: stnId,
        failureCount: data.count,
        avgLossDuration: data.count > 0 ? data.totalDuration / data.count : 0,
        healthScore,
        status: (healthScore < 80 ? 'Critical' : healthScore < 90 ? 'Warning' : 'Healthy') as any,
        affectedLocos: Array.from(data.locos)
      };
    })
    .sort((a, b) => b.failureCount - a.failureCount)
    .slice(0, 10);

  const faultyLocos = Object.entries(locoFailures)
    .map(([locoId, data]) => ({
      locoId,
      failureCount: data.count,
      stationsCovered: Array.from(data.stations),
      status: (data.count > 10 ? 'Critical' : data.count > 5 ? 'Suspect' : 'Normal') as any
    }))
    .sort((a, b) => b.failureCount - a.failureCount);

  // Root Cause Conclusion
  const totalStationFailures = topFaultyStations.reduce((acc, s) => acc + s.failureCount, 0);
  const totalLocoFailures = faultyLocos.reduce((acc, l) => acc + l.failureCount, 0);
  
  let stationSideWeight = totalStationFailures > 0 ? (totalStationFailures / (totalStationFailures + totalLocoFailures)) * 100 : 0;
  let locoSideWeight = 100 - stationSideWeight;

  // Hardware vs Software Analysis
  // Hardware: Correlated with low RF signal strength
  // Software: Correlated with NMS Health issues (non-0) or processing lag
  let hardwareProb = 0;
  let softwareProb = 0;

  const totalDegradations = modeDegradations.length;
  if (totalDegradations > 0) {
    const rfIssues = modeDegradations.filter(d => d.reason.includes('Poor RF Signal')).length;
    const nmsIssues = modeDegradations.filter(d => d.reason.includes('NMS Server')).length;
    const packetLoss = modeDegradations.filter(d => d.reason.includes('Radio Packet Loss')).length;

    hardwareProb = (rfIssues / totalDegradations) * 100;
    softwareProb = (nmsIssues / totalDegradations) * 100;
    
    // Packet loss without poor RF is often a software/processing issue on the radio modem or TCAS
    if (packetLoss > 0 && rfIssues === 0) {
      softwareProb = Math.min(100, softwareProb + (packetLoss / totalDegradations) * 50);
    }
  } else {
    // Fallback based on overall stats
    hardwareProb = (badStns.length / (badStns.length + goodStns.length || 1)) * 100;
    softwareProb = nmsFailRate * 100;
  }

  // Normalize hardware/software
  const totalProb = hardwareProb + softwareProb || 1;
  hardwareProb = (hardwareProb / totalProb) * 100;
  softwareProb = (softwareProb / totalProb) * 100;

  // Refine with Station-wise RFCOMM Data if available
  let stationSpecificIssues = false;
  if (rfStData.length > 0) {
    const stnPerfMap = new Map<string, number>();
    rfStData.forEach(row => {
      const stnId = String(row[stnIdCol] || '').trim();
      const perc = parseFloat(row[percentageCol]) || 0;
      if (stnId && stnId.toLowerCase() !== 'station id' && stnId.toLowerCase() !== 'stationid') {
        stnPerfMap.set(stnId, (stnPerfMap.get(stnId) || 0) + perc);
      }
    });
    
    let lowPerfStns = 0;
    stnPerfMap.forEach((total, id) => {
      const count = rfStData.filter(r => String(r[stnIdCol]) === id).length;
      const avg = total / (count || 1);
      if (avg < 90) lowPerfStns++;
    });

    if (lowPerfStns > 0) {
      stationSideWeight = Math.min(100, stationSideWeight + 30);
      locoSideWeight = 100 - stationSideWeight;
      stationSpecificIssues = true;
    }
  }

  let conclusion = "Random Failures Detected: Intermittent RF loss observed. Likely caused by environmental interference or transient signal drops.";
  let breakdown = "The analysis suggests a mix of factors affecting the communication link.";

  if (stationSpecificIssues || stationSideWeight > 65) {
    conclusion = `Station TCAS / Trackside Issue: High correlation of failures at specific stations (${topFaultyStations.slice(0, 2).map(s => formatStationName(s.stationId)).join(', ')}) across multiple locos.`;
    breakdown = `The failure is localized to the trackside infrastructure. ${hardwareProb > 60 ? "Likely Hardware: Check Station Antenna, RF Cables, or Power Supply." : "Likely Software/Config: Check Station Radio Modem configuration or NMS link."}`;
  } else if (locoSideWeight > 65) {
    conclusion = `Loco TCAS / Onboard Issue: Failures are specific to Loco ${locoId} across multiple stations.`;
    breakdown = `The failure is onboard the locomotive. ${hardwareProb > 60 ? "Likely Hardware: Check Loco RF Module, Antenna alignment, or VSWR." : "Likely Software/Processing: Check TCAS Software version, NMS Health, or Radio processing lag."}`;
  }

  // Deep Analysis Dashboard Logic (DYNAMIC)
  const dashboardTable: { station: string; locoVal: string; othersAvg: string }[] = [];
  
  // Get all unique stations from RF logs
  const allStnsInRf = Array.from(new Set(rfStData.map(r => String(r[stnIdCol] || '').trim())))
    .filter(s => s && s.toLowerCase() !== 'station id' && s.toLowerCase() !== 'stationid');
  
  const stnComparisons = allStnsInRf.map(stnIdVal => {
    const locoStats = rfStData.filter(r => String(r[stnIdCol]) === stnIdVal && String(r[locoIdCol] || '').trim() === String(locoId).trim());
    const otherStats = rfStData.filter(r => String(r[stnIdCol]) === stnIdVal && String(r[locoIdCol] || '').trim() !== String(locoId).trim());
    
    const locoAvg = locoStats.length > 0 ? locoStats.reduce((acc, r) => acc + (parseFloat(r[percentageCol]) || 0), 0) / locoStats.length : null;
    const othersAvg = otherStats.length > 0 ? otherStats.reduce((acc, r) => acc + (parseFloat(r[percentageCol]) || 0), 0) / otherStats.length : 98.5;

    return {
      stationId: stnIdVal,
      locoAvg,
      othersAvg,
      diff: locoAvg !== null ? othersAvg - locoAvg : 0
    };
  });

  // Problem 1: Stations where this loco is significantly worse than others
  const locoSpecificDrops = stnComparisons
    .filter(c => c.locoAvg !== null && c.locoAvg < 90 && c.othersAvg > 95)
    .sort((a, b) => b.diff - a.diff);

  locoSpecificDrops.slice(0, 4).forEach(d => {
    const name = stationMap[d.stationId] || String(d.stationId);
    dashboardTable.push({
      station: formatStationName(name),
      locoVal: `${d.locoAvg?.toFixed(1)}%`,
      othersAvg: `${d.othersAvg.toFixed(1)}%`
    });
  });

  // If no specific drops found, show top faulty stations for this loco
  if (dashboardTable.length === 0) {
    topFaultyStations.slice(0, 3).forEach(stn => {
      const others = stnComparisons.find(c => c.stationId === stn.stationId)?.othersAvg || 98.5;
      const name = stationMap[stn.stationId] || String(stn.stationId);
      dashboardTable.push({
        station: formatStationName(name),
        locoVal: `${stn.healthScore.toFixed(1)}%`,
        othersAvg: `${others.toFixed(1)}%`
      });
    });
  }

  // Find a "Healthy Station" benchmark (highest avg others performance)
  const healthyBenchmark = stnComparisons
    .filter(c => c.othersAvg > 98)
    .sort((a, b) => b.othersAvg - a.othersAvg)[0] || stnComparisons[0];

  // Problem 2 Priority (Stations where multiple locos fail)
  const stationPriority = multiLocoBadStns
    .sort((a, b) => b.locoCount - a.locoCount || a.avgPerf - b.avgPerf)
    .map(s => {
      const name = stationMap[s.stationId] || String(s.stationId);
      return formatStationName(name);
    });

  const isLocoFaulty = locoSideWeight > 60 || locoSpecificDrops.length > 1;

  // Pre-calculate station-loco metrics for performance optimization
  const stnLocoMetrics = new Map<string, Map<string, { exp: number, rec: number, sum: number, count: number }>>();
  rfStData.forEach(row => {
    const sId = String(row[stnIdCol] || '').trim();
    const lId = String(row[locoIdCol] || '').trim();
    const exp = parseNumber(row[expectedCol]) || 0;
    const rec = parseNumber(row[receivedCol]) || 0;
    const perc = parseFloat(row[percentageCol]) || (exp > 0 ? (rec / exp) * 100 : 0);
    if (!sId || !lId || sId.toLowerCase() === 'station id' || sId.toLowerCase() === 'stationid' || lId.toLowerCase() === 'loco id' || lId.toLowerCase() === 'locoid') return;

    if (!stnLocoMetrics.has(sId)) stnLocoMetrics.set(sId, new Map());
    const lMap = stnLocoMetrics.get(sId)!;
    if (!lMap.has(lId)) lMap.set(lId, { exp: 0, rec: 0, sum: 0, count: 0 });
    const m = lMap.get(lId)!;
    m.exp += exp;
    m.rec += rec;
    m.sum += perc;
    m.count++;
  });

  // Pre-calculate station-wide averages (excluding specific locos)
  const stnGlobalMetrics = new Map<string, { exp: number, rec: number, sum: number, count: number }>();
  const locoPerformanceMap = new Map<string, number>();
  const locoPerfCounts = new Map<string, number>();
  const locoPerfExpRec = new Map<string, { exp: number, rec: number }>();

  stnLocoMetrics.forEach((lMap, sId) => {
    let sExp = 0;
    let sRec = 0;
    let sSum = 0;
    let sCount = 0;
    lMap.forEach((m, lId) => {
      sExp += m.exp;
      sRec += m.rec;
      sSum += m.sum;
      sCount += m.count;
      
      if (!locoPerfExpRec.has(lId)) locoPerfExpRec.set(lId, { exp: 0, rec: 0 });
      const lp = locoPerfExpRec.get(lId)!;
      lp.exp += m.exp;
      lp.rec += m.rec;
      
      locoPerformanceMap.set(lId, (locoPerformanceMap.get(lId) || 0) + m.sum);
      locoPerfCounts.set(lId, (locoPerfCounts.get(lId) || 0) + m.count);
    });
    stnGlobalMetrics.set(sId, { exp: sExp, rec: sRec, sum: sSum, count: sCount });
  });

  // Finalize loco performance averages
  locoPerformanceMap.forEach((sum, lId) => {
    const lp = locoPerfExpRec.get(lId);
    if (lp && lp.exp > 0) {
      locoPerformanceMap.set(lId, (lp.rec / lp.exp) * 100);
    } else {
      locoPerformanceMap.set(lId, sum / (locoPerfCounts.get(lId) || 1));
    }
  });

  // Helper to calculate analysis for a specific loco
  const getLocoAnalysis = (targetLocoId: string) => {
    const isAll = targetLocoId === 'All' || targetLocoId === 'All Locos';
    
    // Filter failures for this specific loco if not "All"
    const targetLocoFailures = isAll ? faultyLocos : faultyLocos.filter(l => String(l.locoId) === targetLocoId);
    const targetStnFailures = isAll ? topFaultyStations : topFaultyStations.filter(s => s.affectedLocos.includes(targetLocoId));
    
    const totalStnFailures = targetStnFailures.reduce((acc, s) => acc + s.failureCount, 0);
    const totalLcoFailures = targetLocoFailures.reduce((acc, l) => acc + l.failureCount, 0);
    const totalFailures = totalStnFailures + totalLcoFailures;
    let stnSideWeight = totalFailures > 0 ? (totalStnFailures / totalFailures) * 100 : 0;
    let lcoSideWeight = totalFailures > 0 ? (totalLcoFailures / totalFailures) * 100 : 0;

    // Refine with Station-side data
    let stnSpecificIssues = false;
    let lowPerfStnsCount = 0;
    stnGlobalMetrics.forEach((m, sId) => {
      const avg = m.exp > 0 ? (m.rec / m.exp) * 100 : (m.sum / (m.count || 1));
      if (avg < 90) {
        // If "All", any low perf station counts. If specific loco, only if that loco also failed there
        let locoAvg = 100;
        if (!isAll) {
          const lMetric = stnLocoMetrics.get(sId)?.get(targetLocoId);
          if (lMetric) {
            locoAvg = lMetric.exp > 0 ? (lMetric.rec / lMetric.exp) * 100 : (lMetric.sum / (lMetric.count || 1));
          }
        }
        if (isAll || locoAvg < 95) {
          lowPerfStnsCount++;
        }
      }
    });

    if (lowPerfStnsCount > 0) {
      stnSideWeight = Math.min(100, stnSideWeight + 30);
      lcoSideWeight = 100 - stnSideWeight;
      stnSpecificIssues = true;
    }

    // Hardware vs Software (Master Logic)
    // RF% bad + NMS OK -> Hardware
    // NMS bad + RF% OK -> Software
    // Both bad -> Correlated
    let hProb = 50;
    let sProb = 50;

    const locoPerf = isAll ? locoPerformance : (locoPerformanceMap.get(targetLocoId) || 100);
    const locoNmsLogs = nmsLogs.filter(n => isAll || String(n.locoId) === targetLocoId);
    const locoNmsFail = locoNmsLogs.filter(n => n.health !== '32').length;
    const locoNmsRate = locoNmsLogs.length > 0 ? (locoNmsFail / locoNmsLogs.length) * 100 : 0;

    if (locoPerf < 90 && locoNmsRate < 15) {
      hProb = 85;
      sProb = 15;
    } else if (locoPerf > 95 && locoNmsRate > 25) {
      sProb = 85;
      hProb = 15;
    } else if (locoPerf < 90 && locoNmsRate > 25) {
      hProb = 60;
      sProb = 40; // Correlated
    }

    // Refine with MA Lag (Software indicator)
    const locoMa = maPacketsProcessed.filter(p => isAll || String(p.locoId) === targetLocoId);
    const locoAvgLag = locoMa.length > 0 ? locoMa.reduce((acc, p) => acc + p.delay, 0) / locoMa.length : 0;
    if (locoAvgLag > 1.5) {
      sProb = Math.min(100, sProb + 20);
      hProb = Math.max(0, hProb - 20);
    }

    let conc = isAll ? "Fleet-wide Analysis: Multiple locomotives and stations showing intermittent issues." : `Analysis for Loco ${targetLocoId}: Evaluating onboard vs trackside factors.`;
    let bdown = "The analysis suggests a mix of factors affecting the communication link.";

    if (stnSpecificIssues || stnSideWeight > 65) {
      conc = isAll ? "Primary Trackside Issues: High correlation of failures at specific stations across the fleet." : `Station-side Issue: Failures for Loco ${targetLocoId} are highly correlated with specific trackside locations.`;
      bdown = `The failure is localized to the trackside infrastructure. ${hProb > 60 ? "Likely Hardware: Check Station Antenna, RF Cables, or Power Supply." : "Likely Software/Config: Check Station Radio Modem configuration or NMS link."}`;
    } else if (lcoSideWeight > 65) {
      conc = isAll ? "Locomotive Fleet Issues: Failures are distributed across locomotives regardless of station." : `Loco-side Issue: Failures are specific to Loco ${targetLocoId} across multiple stations.`;
      bdown = `The failure is onboard the locomotive. ${hProb > 60 ? "Likely Hardware: Check Loco RF Module, Antenna alignment, or VSWR." : "Likely Software/Processing: Check TCAS Software version, NMS Health, or Radio processing lag."}`;
    }

    // Dashboard Logic
    const dTable: { station: string; locoVal: string; othersAvg: string }[] = [];
    const stnComps = Array.from(stnLocoMetrics.keys()).map(sId => {
      const lMap = stnLocoMetrics.get(sId)!;
      const gMetric = stnGlobalMetrics.get(sId)!;
      
      let lAvg: number | null = null;
      // Use Global Fleet Average as the stable benchmark for "Baaki Locos (Avg)"
      const globalAvg = gMetric.exp > 0 ? (gMetric.rec / gMetric.exp) * 100 : (gMetric.sum / (gMetric.count || 1));
      let oAvg = globalAvg;

      if (isAll) {
        lAvg = globalAvg;
        // When looking at "All", compare against a high-performance target (98.5%)
        oAvg = 98.5;
      } else {
        const lMetric = lMap.get(targetLocoId);
        if (lMetric) {
          lAvg = lMetric.exp > 0 ? (lMetric.rec / lMetric.exp) * 100 : (lMetric.sum / lMetric.count);
        }
      }

      return { stationId: sId, locoAvg: lAvg, othersAvg: oAvg, diff: lAvg !== null ? oAvg - lAvg : 0 };
    });

    const lDrops = stnComps
      .filter(c => c.locoAvg !== null && c.locoAvg < 90 && c.othersAvg > 95)
      .sort((a, b) => b.diff - a.diff);

    lDrops.slice(0, 4).forEach(d => {
      dTable.push({ station: d.stationId, locoVal: `${d.locoAvg?.toFixed(1)}%`, othersAvg: `${d.othersAvg.toFixed(1)}%` });
    });

    if (dTable.length === 0) {
      const relevantStns = isAll ? topFaultyStations : topFaultyStations.filter(s => s.affectedLocos.includes(targetLocoId));
      relevantStns.slice(0, 3).forEach(stn => {
        const comp = stnComps.find(c => c.stationId === stn.stationId);
        const locoAvg = comp?.locoAvg ?? stn.healthScore;
        const others = comp?.othersAvg ?? 98.5;
        dTable.push({ station: stn.stationId, locoVal: `${locoAvg.toFixed(1)}%`, othersAvg: `${others.toFixed(1)}%` });
      });
    }

    const hBenchmark = stnComps
      .filter(c => c.othersAvg > 98)
      .sort((a, b) => b.othersAvg - a.othersAvg)[0] || stnComps[0];

    const isLFaulty = lDrops.length > 0 && lcoSideWeight > 50;
    const isSFaulty = stnSideWeight > 50 && multiLocoBadStns.length > 0;
    
    // Loco-specific priority: Only show stations where THIS loco also had issues
    const locoSpecificPriority = multiLocoBadStns
      .filter(s => isAll || stnLocoMetrics.get(String(s.stationId))?.has(targetLocoId))
      .sort((a, b) => b.locoCount - a.locoCount || a.avgPerf - b.avgPerf)
      .map(s => String(s.stationId));

    const topPriorityStns = locoSpecificPriority.slice(0, 15);

    return {
      topFaultyStations: targetStnFailures,
      faultyLocos: targetLocoFailures,
      criticalEvents: criticalEvents.filter(e => isAll || e.locoId === targetLocoId || e.locoId === 'Multiple').slice(0, 20),
      rootCause: {
        stationSide: Math.round(stnSideWeight),
        locoSide: Math.round(lcoSideWeight),
        hardwareProb: Math.round(hProb),
        softwareProb: Math.round(sProb),
        conclusion: conc,
        breakdown: bdown
      },
      dashboard: {
        conclusion: (isLFaulty && isSFaulty) ? "Multiple Issues Detected (Loco + Station)" : 
                    isLFaulty ? `Problem Detected: Loco ${isAll ? 'Fleet' : targetLocoId} TCAS Unit Suspect` :
                    isSFaulty ? "Problem Detected: Station-side TCAS/RF Health Issues" :
                    `Locomotive ${isAll ? 'Fleet' : targetLocoId} Fit - System Healthy`,
        problem1: {
          title: isLFaulty 
            ? `Problem 1 — Loco ${isAll ? 'Fleet' : targetLocoId} TCAS unit is suspect` 
            : `Problem 1 — Loco ${isAll ? 'Fleet' : targetLocoId} Performance Audit (Fit)`,
          description: isLFaulty
            ? `Loco ${isAll ? 'Fleet' : targetLocoId} showed performance drops at ${lDrops.length} stations while other locos performed normally there. This indicates a loco-side hardware/software issue.`
            : `Loco ${isAll ? 'Fleet' : targetLocoId} performance is equal to or better than the fleet average. No major loco-side issues detected.`,
          table: dTable,
          causes: [
            "Physical damage or loose connection in the loco antenna",
            "RF transceiver module is weak (low power output)",
            "TCAS software bug causing failures at specific station configurations"
          ]
        },
        problem2: {
          title: "Problem 2 — Station-side TCAS/RF Health",
          description: "When multiple independent locos fail at the same location, the station TCAS antenna or RF hardware should be inspected.",
          priority: topPriorityStns.length > 0 ? topPriorityStns : ["VDH", "NVS", "SCH", "BIM", "ST", "UDN", "SJN_BLD", "BL", "BHET", "AML", "SJN", "ATUL", "UVD", "PAD", "KEB"]
        },
        amlConclusion: hBenchmark 
          ? `${formatStationName(hBenchmark.stationId)} station is completely clear. Other locos achieved an average performance of ${hBenchmark.othersAvg.toFixed(1)}% here, proving that the track-side equipment is healthy.`
          : "Fleet data suggests track-side equipment is generally healthy at major stations.",
        actionRequired: isLFaulty
          ? `Send Loco ${isAll ? 'Fleet' : targetLocoId} to the workshop — check the RF antenna and transceiver module, and verify the TCAS firmware version.`
          : `Locomotive ${isAll ? 'All' : targetLocoId} is fit. It is recommended to inspect the station-side equipment (Priority: ${topPriorityStns.slice(0, 3).join(', ')}).`
      }
    };
  };

  const locoAnalyses: Record<string, any> = {};
  locoIds.forEach(id => {
    locoAnalyses[id] = getLocoAnalysis(id);
  });
  locoAnalyses['All'] = getLocoAnalysis('All');
  locoAnalyses['All Locos'] = locoAnalyses['All'];

  const stationDeepAnalysis = locoAnalyses[locoId] || locoAnalyses['All'];

  // Moving Radio Loss Analysis (Speed > 0)
  const movingRadioLoss: DashboardStats['movingRadioLoss'] = [];
  
  locoIds.forEach(lId => {
    const lIdStr = String(lId);
    const lTrnData = trnData?.filter(r => String(r[trnLocoIdCol] || locoId).trim() === lIdStr) || [];
    
    let r1Packets = 0;
    let r2Packets = 0;
    let totalPackets = 0;
    
    lTrnData.forEach(row => {
      const radioVal = String(row[trnRadioCol] || '').toLowerCase();
      if (radioVal.includes('radio 1') || radioVal.includes('r1')) r1Packets++;
      else if (radioVal.includes('radio 2') || radioVal.includes('r2')) r2Packets++;
      totalPackets++;
    });
    
    const r1Usage = totalPackets > 0 ? (r1Packets / totalPackets) * 100 : 50;
    const r2Usage = totalPackets > 0 ? (r2Packets / totalPackets) * 100 : 50;
    
    let movingGaps = 0;
    let maxGap = 0;
    let lastPacketTime: number | null = null;
    let lastSpeed: number = 0;
    
    lTrnData.forEach(row => {
      const speed = Number(row[speedCol]) || 0;
      const time = parseTime(getTrnTime(row));
      
      let hasRadio = false;
      if (trnKeys && trnKeys.length > 0) {
        for (let j = 29; j <= 57; j++) {
          if (row[trnKeys[j]] !== undefined && row[trnKeys[j]] !== null && row[trnKeys[j]] !== '' && row[trnKeys[j]] !== 0) { 
            hasRadio = true; 
            break; 
          }
        }
      }
      
      if (hasRadio) {
        if (lastPacketTime !== null) {
          const gap = (time - lastPacketTime) / 1000;
          // Consider it a moving gap if speed was > 0 either at the start or the end of the gap
          if ((lastSpeed > 0 || speed > 0) && gap > 5 && gap < 86400) { 
            movingGaps++;
            if (gap > maxGap) maxGap = gap;
          }
        }
        lastPacketTime = time;
        lastSpeed = speed;
      }
    });
    
    let conclusion = "Normal/Low Issue";
    if (movingGaps > 20) conclusion = "Highest Signal Drop While Moving";
    else if (maxGap > 1000) conclusion = "Very Large Communication Gaps";
    else if (movingGaps > 15) conclusion = "Continuous Signal Instability";
    else if (Math.abs(r1Usage - r2Usage) > 8) conclusion = `Hardware Issue (Radio ${r1Usage < r2Usage ? '1' : '2'})`;
    else if (movingGaps === 0 && totalPackets > 0) conclusion = "Excellent Performance";

    movingRadioLoss.push({
      locoId: lId,
      movingGaps,
      maxGap: Math.round(maxGap),
      r1Usage: Number(r1Usage.toFixed(1)),
      r2Usage: Number(r2Usage.toFixed(1)),
      conclusion
    });
  });

  return {
    locoId,
    logDate,
    allDates,
    locoIds,
    stnPerf,
    badStns,
    goodStns,
    locoPerformance,
    arCount,
    maCount,
    nmsFailRate,
    avgLag,
    maPackets: maPacketsProcessed,
    nmsStatus,
    nmsLogs,
    nmsLocoStats,
    nmsDeepAnalysis,
    intervalDist,
    diagnosticAdvice,
    stationStats,
    rawRfLogs,
    modeDegradations,
    shortPackets,
    brakeApplications,
    signalOverrides,
    sosEvents,
    trainConfigChanges,
    uniqueTrainLengths,
    tagLinkIssues,
    stationRadioPackets,
    multiLocoBadStns,
    startTime,
    endTime,
    stationDeepAnalysis,
    locoAnalyses,
    skippedRfRows,
    movingRadioLoss
  };
};
