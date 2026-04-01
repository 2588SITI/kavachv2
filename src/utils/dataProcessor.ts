/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { RFData, TRNData, RadioData, DashboardStats, bucketDelay } from '../types';

export const parseFile = async (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    if (file.name.endsWith('.csv')) {
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
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        // Aggressive date search in headers/first rows if not found in data
        let foundDate: string | null = null;
        const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
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

        // Clean keys
        const cleaned = jsonData.map((row: any) => {
          const newRow: any = {};
          Object.keys(row).forEach(key => {
            newRow[key.trim()] = row[key];
          });
          if (foundDate && !newRow['Date'] && !newRow['Log Date']) {
            newRow['_extractedDate'] = foundDate;
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

const parseTime = (timeStr: any) => {
  if (!timeStr) return NaN;
  let str = String(timeStr).trim();
  
  // If it's just HH:mm:ss, prepend a dummy date
  if (str.match(/^\d{1,2}:\d{1,2}:\d{1,2}$/)) {
    str = `2000-01-01 ${str}`;
  }

  // Handle DD/MM/YYYY or DD-MM-YYYY formats which JS Date often fails to parse
  const dmyRegex = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(.*)$/;
  const match = str.match(dmyRegex);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    let year = match[3];
    if (year.length === 2) year = `20${year}`;
    const rest = match[4] || '';
    // Convert to YYYY-MM-DD for reliable parsing
    str = `${year}-${month}-${day}${rest}`;
  }

  const d = new Date(str);
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
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const year = parts[2].length === 2 ? 2000 + parseInt(parts[2]) : parseInt(parts[2]);
    return new Date(year, month, day).getTime();
  }
  return new Date(d).getTime() || 0;
};

export const processDashboardData = (
  rfData: RFData[],
  trnData: TRNData[] | null,
  radioData: RadioData[]
): DashboardStats => {
  const firstRf = rfData[0] || {};
  const firstTrn = trnData?.[0] || {};
  const firstRadio = radioData[0] || {};

  const isValidLocoId = (id: any) => {
    if (id === null || id === undefined) return false;
    const s = String(id).trim();
    return s !== '' && s !== '-' && s !== 'N/A' && s !== 'null' && s !== 'undefined';
  };

  const locoIdCol = findColumn(firstRf, 'Loco Id', 'LocoId', 'Loco_Id', 'Loco No', 'LocoNo', 'Loco_No', 'Engine No', 'EngineId') || 'Loco Id';
  const trnLocoIdCol = findColumn(firstTrn, 'Loco Id', 'LocoId', 'Loco_Id', 'Loco No', 'LocoNo', 'Loco_No', 'Engine No', 'EngineId') || 'Loco Id';
  const radioLocoIdCol = findColumn(firstRadio, 'Loco Id', 'LocoId', 'Loco_Id', 'Loco No', 'LocoNo', 'Loco_No', 'Engine No', 'EngineId') || 'Loco Id';

  const stnIdCol = findColumn(firstRf, 'Station Id', 'StationId', 'Station_Id') || 'Station Id';
  const percentageCol = findColumn(firstRf, 'Percentage', 'Perc', 'Success', 'RFCOMM %') || 'Percentage';
  
  // RF Time Logic: User says D and F columns (index 3 and 5)
  const rfDateCol = findColumn(firstRf, 'Date', 'Log Date', 'LogDate', 'Log_Date', 'Report Date', 'ReportDate', 'Date_Time', 'DateTime', 'Day');
  const rfTimeOnlyCol = findColumn(firstRf, 'Time', 'Log Time', 'LogTime', 'Log_Time', 'Report Time', 'ReportTime', 'Clock');
  const rfTimestampCol = findColumn(firstRf, 'Timestamp', 'DateTime', 'Date Time', 'Log Time Stamp', 'Log_Time_Stamp', 'Time_Stamp', 'TimeStamp');
  const rfKeys = Object.keys(firstRf);
  
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
    if (rfTimestampCol && row[rfTimestampCol]) rawTime = String(row[rfTimestampCol]);
    else if (rfDateCol && rfTimeOnlyCol && row[rfDateCol] && row[rfTimeOnlyCol]) {
      rawTime = `${row[rfDateCol]} ${row[rfTimeOnlyCol]}`;
    }
    else if (row['_extractedDate'] && rfTimeOnlyCol && row[rfTimeOnlyCol]) {
      rawTime = `${row['_extractedDate']} ${row[rfTimeOnlyCol]}`;
    }
    else if (rfTimeOnlyCol && row[rfTimeOnlyCol]) rawTime = String(row[rfTimeOnlyCol]);
    else if (rfDateCol && row[rfDateCol]) rawTime = String(row[rfDateCol]);
    else if (row['_extractedDate']) rawTime = String(row['_extractedDate']);
    else if (rfKeys[3] && rfKeys[5] && row[rfKeys[3]] && row[rfKeys[5]]) {
      rawTime = `${row[rfKeys[3]]} ${row[rfKeys[5]]}`;
    }
    else if (rfKeys[3] && row[rfKeys[3]]) rawTime = String(row[rfKeys[3]]);
    else if (rfKeys[5] && row[rfKeys[5]]) rawTime = String(row[rfKeys[5]]);
    
    // Ensure date is in the time string if we have it
    const rawDate = String(row._extractedDate || (rfDateCol && row[rfDateCol]) || '').trim();
    const rowDate = normalizeDate(rawDate);
    if (rowDate && rowDate !== 'Unknown' && rowDate !== 'N/A' && !rawTime.includes(rowDate)) {
      rawTime = `${rowDate} ${rawTime}`;
    }
    
    return cleanTimeStr(rawTime);
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
  const firstValidRf = rfData.find(r => isValidLocoId(r[locoIdCol]));
  const firstValidTrn = trnData?.find(r => isValidLocoId(r[trnLocoIdCol]));
  const firstValidRadio = radioData.find(r => isValidLocoId(r[radioLocoIdCol]));
  
  if (firstValidRf) locoId = String(firstValidRf[locoIdCol]).trim();
  else if (firstValidTrn) locoId = String(firstValidTrn[trnLocoIdCol]).trim();
  else if (firstValidRadio) locoId = String(firstValidRadio[radioLocoIdCol]).trim();

  const allLocos = new Set<string>();
  rfData.forEach(row => { 
    const val = row[locoIdCol];
    if (isValidLocoId(val)) allLocos.add(String(val).trim()); 
  });
  trnData?.forEach(row => { 
    const val = row[trnLocoIdCol];
    if (isValidLocoId(val)) allLocos.add(String(val).trim()); 
  });
  radioData.forEach(row => { 
    const val = row[radioLocoIdCol];
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
    date: string 
  }> = {};
  
  const expectedCol = findColumn(firstRf, 'Expected', 'Exp', 'Total', 'Expected Count') || 'Expected';
  const receivedCol = findColumn(firstRf, 'Received', 'Rec', 'SuccessCount', 'Recieved Count') || 'Received';
  const directionCol = findColumn(firstRf, 'Direction', 'Mode', 'Nominal/Reverse', 'Type', 'Nominal_Reverse') || 'Direction';

  const seenRfRows = new Set<string>();
  
  rfData.forEach((row) => {
    const stnId = String(row[stnIdCol] || '').trim();
    if (!stnId) return;
    
    const rawDirection = String(row[directionCol] || 'N/A');
    const direction = rawDirection.toLowerCase().includes('nominal') ? 'Nominal' : 
                      rawDirection.toLowerCase().includes('reverse') ? 'Reverse' : rawDirection;
    const rawRowLocoId = row[locoIdCol] || locoId;
    
    // Skip invalid loco IDs
    if (!isValidLocoId(rawRowLocoId)) return;
    
    const rowLocoId = String(rawRowLocoId).trim();
    const rawDate = String(row._extractedDate || (rfDateCol && row[rfDateCol]) || 'Unknown').trim();
    const rowDateNormalized = normalizeDate(rawDate);
    const rowTime = getRfTime(row);
    
    // Deduplicate: same loco, same station, same direction, same time, same date
    const rowKey = `${rowLocoId}_${stnId}_${direction}_${rowTime}_${rowDateNormalized}`;
    if (seenRfRows.has(rowKey)) return;
    seenRfRows.add(rowKey);

    const key = `${stnId}_${direction}_${rowLocoId}_${rowDateNormalized}`;
    
    if (!stnGroups[key]) stnGroups[key] = { 
      expected: 0, received: 0, 
      percentages: [],
      times: [], locoId: rowLocoId, date: rowDateNormalized 
    };
    
    const exp = parseNumber(row[expectedCol]);
    const rec = parseNumber(row[receivedCol]);
    const perc = parseNumber(row[percentageCol]) || (exp > 0 ? (rec / exp) * 100 : 0);
    
    stnGroups[key].expected += exp;
    stnGroups[key].received += rec;
    stnGroups[key].percentages.push(perc);
    
    if (rowTime !== 'N/A') stnGroups[key].times.push(rowTime);
  });

  const stationStats = Object.entries(stnGroups).map(([key, data]) => {
    const [stationId, direction] = key.split('_');
    const totalPercSum = data.percentages.reduce((a, b) => a + b, 0);
    const rowCount = data.percentages.length;
    const percentage = rowCount > 0 ? totalPercSum / rowCount : 0;

    return {
      stationId,
      direction,
      percentage,
      expected: data.expected,
      received: data.received,
      locoId: data.locoId,
      date: data.date,
      rowCount,
      totalPercSum
    };
  });

  const stnPerf = Object.entries(stnGroups).map(([key, data]) => {
    const [stationId] = key.split('_');
    const sortedTimes = [...data.times].sort();
    
    const percentage = data.percentages.length > 0 
      ? data.percentages.reduce((a, b) => a + b, 0) / data.percentages.length 
      : 0;

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
      
      return {
        stationId: String(row[stnIdCol] || 'N/A'),
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
  const locoPerformance = stationStats.length > 0 
    ? stationStats.reduce((acc, s) => acc + s.percentage, 0) / stationStats.length 
    : 0;

  // Radio Data Mapping
  const packetTypeCol = findColumn(firstRadio, 'Packet Type', 'PacketType', 'Type') || 'Packet Type';
  const lengthCol = findColumn(firstRadio, 'Length', 'Len', 'Size') || 'Length';
  const sourceCol = findColumn(firstRadio, 'Source', 'Src', 'From') || 'Source';
  const messageCol = findColumn(firstRadio, 'Message', 'Msg', 'Data') || 'Message';

  const arCount = radioData.filter((p) => String(p[packetTypeCol]).toLowerCase().includes('accessrequest')).length;
  const maPacketsRaw = radioData.filter((p) => String(p[packetTypeCol]).toLowerCase().includes('movementauthority'));
  const maCount = maPacketsRaw.length;

  // Short Packets (< 10)
  const shortPackets = radioData
    .filter(p => Number(p[lengthCol]) < 10 && p[lengthCol] !== undefined && isValidLocoId(p[radioLocoIdCol] || locoId))
    .map(p => ({
      time: getRadioTime(p),
      type: String(p[packetTypeCol]),
      length: Number(p[lengthCol]),
      locoId: String(p[radioLocoIdCol] || locoId).trim()
    }));

  // SOS Events
  const sosEvents = radioData
    .filter(p => (String(p[packetTypeCol]).toLowerCase().includes('sos') || String(p[messageCol]).toLowerCase().includes('sos')) && isValidLocoId(p[radioLocoIdCol] || locoId))
    .map(p => ({
      time: getRadioTime(p),
      source: String(p[sourceCol] || 'Unknown'),
      type: String(p[packetTypeCol]),
      stationId: String(p[stnIdCol] || 'N/A'),
      locoId: String(p[radioLocoIdCol] || locoId).trim()
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
        locoId: String(p[radioLocoIdCol] || locoId).trim()
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
        locoId: String(row[trnLocoIdCol] || locoId).trim()
      });
      }
    });
  }

  const tagLinkIssues = [...radioTagIssues, ...trnTagIssues].sort((a, b) => a.time.localeCompare(b.time));

  // NMS Logic
  const trnKeys = trnData && trnData.length > 0 ? Object.keys(trnData[0]) : [];
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
        // Inclusive healthy check: 32 is standard, but handle common variations
        const isHealthy = val === '32' || val === 'healthy' || val === 'ok' || val === '0';
        return !isHealthy && isValidLocoId(row[trnLocoIdCol] || locoId);
      }).length / 
       (trnData.filter(row => isValidLocoId(row[trnLocoIdCol] || locoId)).length || 1)) * 100
    : 0;

  const nmsStatusMap: Record<string, number> = {};
  trnData?.forEach((row) => {
    let status = String(row[nmsHealthCol] || 'Unknown').trim();
    if (status === '32') status = '32 (Healthy)';
    nmsStatusMap[status] = (nmsStatusMap[status] || 0) + 1;
  });
  const nmsStatus = Object.entries(nmsStatusMap).map(([name, value]) => ({ name, value }));
  const nmsLogs = trnData?.map(row => ({
    time: getTrnTime(row),
    health: String(row[nmsHealthCol]),
    locoId: String(row[trnLocoIdCol] || locoId).trim()
  })) || [];

  // Mode Degradation
  const modeDegradations: DashboardStats['modeDegradations'] = [];
  let lastMode: string | null = null;
  let lastAck: string | null = null;
  
  trnData?.forEach((row) => {
    const rawMode = String(row[modeCol] || '').trim();
    const currentAck = String(row[lpResponseCol] || '').trim();
    const event = String(row[eventCol] || '').toLowerCase();
    
    // Normalize mode names for detection
    let currentMode = rawMode;
    if (rawMode.toLowerCase().includes('staff')) currentMode = 'SR';
    else if (rawMode.toLowerCase().includes('full')) currentMode = 'FS';
    else if (rawMode.toLowerCase().includes('sight')) currentMode = 'OS';
    else if (rawMode.toLowerCase().includes('shunt')) currentMode = 'SH';
    else if (rawMode.toLowerCase().includes('trip')) currentMode = 'TR';
    
    if (currentMode) {
      const isDegradationMessage = currentAck.toLowerCase().includes('to_sr') || 
                                   currentAck.toLowerCase().includes('to_os') ||
                                   currentAck.toLowerCase().includes('degrad');
                                   
      const modeChanged = lastMode && currentMode !== lastMode;
      const ackChanged = lastAck && currentAck !== lastAck;
      
      // If it's the first row and it's already in a degraded state with a message, count it
      const isFirstRowDegraded = !lastMode && (currentMode === 'SR' || currentMode === 'OS' || currentMode === 'SH') && isDegradationMessage;

      if (modeChanged || ackChanged || isFirstRowDegraded) {
        // Any change from FS or OS to something else is usually a degradation
        // Or if the Pilot Ack explicitly says "to_SR" or "degrad"
        const isDegradation = (lastMode === 'FS' && currentMode !== 'FS') || 
                              (lastMode === 'OS' && currentMode !== 'OS' && currentMode !== 'FS') ||
                              isDegradationMessage ||
                              event.includes('degrad');
                              
        if (isDegradation) {
          modeDegradations.push({
            time: getTrnTime(row),
            from: lastMode || (isDegradationMessage && currentAck.includes('FS_to') ? 'FS' : 'Unknown'),
            to: currentMode,
            reason: String(row[reasonCol] || row[eventCol] || currentAck || 'Mode Change'),
            lpResponse: currentAck,
            stationId: String(row[findColumn(row, 'Station Id', 'StationId', 'Station_Id') || ''] || 'N/A'),
            locoId: String(row[trnLocoIdCol] || locoId).trim()
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
      locoId: String(row[trnLocoIdCol] || locoId).trim()
    })) || [];

  // Signal Overrides
  const signalOverrides = trnData
    ?.filter(row => String(row[eventCol] || '').toLowerCase().includes('override') && isValidLocoId(row[trnLocoIdCol] || locoId))
    .map(row => ({
      time: getTrnTime(row),
      signalId: String(row[signalIdCol] || 'N/A'),
      status: String(row[signalStatusCol] || 'Overridden'),
      stationId: String(row[findColumn(row, 'Station Id', 'StationId', 'Station_Id') || ''] || 'N/A'),
      locoId: String(row[trnLocoIdCol] || locoId).trim()
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
          locoId: String(row[trnLocoIdCol] || locoId).trim()
        });
        }
        lastConfig[param] = val;
      }
    });
  });

  const uniqueTrainLengths = Array.from(uniqueTrainLengthsMap.entries())
    .map(([length, info]) => ({ length, ...info, locoId: String(locoId).trim() })) // Simplified locoId for train lengths as it's usually static
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

  maPacketsRaw.forEach((p, i) => {
    const currentTime = parseTime(p[radioTimeCol]);
    const rowLocoId = p[radioLocoIdCol] || locoId;
    if (i > 0 && lastTime !== null && !isNaN(currentTime) && isValidLocoId(rowLocoId)) {
      const delay = (currentTime - lastTime) / 1000;
      if (delay >= 0) { // Filter out negative delays if any
        maPacketsProcessed.push({
          time: getRadioTime(p),
          delay,
          category: bucketDelay(delay),
          length: Number(p[lengthCol]) || 0,
          locoId: String(rowLocoId).trim()
        });
      }
    }
    lastTime = currentTime;
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
      title: "NMS Server Connectivity Issue",
      detail: `NMS Health failure rate is ${nmsFailRate.toFixed(1)}%. Logs show frequent non-32 values.`,
      action: "Test: Ping NMS Server from Loco. Check: NMS Server IP config, Ethernet cables, and Network Switch health.",
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
    diagnosticAdvice.push({
      title: "Station Hardware Marginal Performance",
      detail: `Stations ${badStns.join(', ')} are performing below the 95% efficiency threshold.`,
      action: "Test: VSWR measurement for Station Antennas. Check: RF Connectors, Coaxial cables, and Station Radio power output.",
      severity: 'medium'
    });
  }

  if (modeDegradations.length > 0) {
    diagnosticAdvice.push({
      title: "Mode Degradation Events Detected",
      detail: `${modeDegradations.length} mode degradation events were recorded in the TRNMSNMA logs.`,
      action: "Check: LP Response times, NMS Health correlation, and Radio MA lag at the time of degradation.",
      severity: 'high'
    });
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

  // Identify RF Loss Events from rfData
  rfData.forEach((row) => {
    const stnId = row[stnIdCol];
    const rawRowLocoId = row[locoIdCol] || locoId;
    if (!isValidLocoId(rawRowLocoId) || stnId === undefined) return;
    const rowLocoId = String(rawRowLocoId).trim();
    const received = Number(row[receivedCol]) || 0;
    const expected = Number(row[expectedCol]) || 0;
    const percentage = Number(row[percentageCol]) || 0;
    const time = getRfTime(row);

    if (!stationFailures[stnId]) {
      stationFailures[stnId] = { count: 0, totalDuration: 0, locos: new Set(), totalEvents: 0, workingEvents: 0 };
    }
    stationFailures[stnId].totalEvents++;
    if (percentage >= 95) stationFailures[stnId].workingEvents++;

    // A loss is defined as percentage < 50 or received == 0 when expected > 0
    if (percentage < 50 || (expected > 0 && received === 0)) {
      stationFailures[stnId].count++;
      stationFailures[stnId].locos.add(rowLocoId);
      
      if (!locoFailures[rowLocoId]) {
        locoFailures[rowLocoId] = { count: 0, stations: new Set() };
      }
      locoFailures[rowLocoId].count++;
      locoFailures[rowLocoId].stations.add(stnId);

      // Duration Analysis (approximate 30s per row if it's a failure)
      const duration = 30; 
      stationFailures[stnId].totalDuration += duration;

      if (duration >= 60) {
        criticalEvents.push({
          time,
          stationId: stnId,
          locoId: rowLocoId,
          duration,
          type: 'Long Duration',
          description: `Long RF loss at station ${stnId}`
        });
      }
    }
  });

  // Time-based Analysis: Check for multiple trains at same time
  const timeMap: Record<string, Set<string | number>> = {};
  rfData.forEach(row => {
    const time = getRfTime(row);
    const percentage = Number(row[percentageCol]) || 0;
    const stnId = row[stnIdCol];
    if (percentage < 50 && time !== 'N/A') {
      const key = `${time}_${stnId}`;
      if (!timeMap[key]) timeMap[key] = new Set();
      timeMap[key].add(row[locoIdCol] || locoId);
    }
  });

  Object.entries(timeMap).forEach(([key, locos]) => {
    if (locos.size > 1) {
      const [time, stnId] = key.split('_');
      criticalEvents.push({
        time,
        stationId: stnId,
        locoId: 'Multiple',
        duration: 0,
        type: 'Multiple Trains Affected',
        description: `${locos.size} trains affected at ${stnId} simultaneously`
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
  const stationSideWeight = totalStationFailures > 0 ? (totalStationFailures / (totalStationFailures + totalLocoFailures)) * 100 : 0;
  const locoSideWeight = 100 - stationSideWeight;

  let conclusion = "Random Failures Detected: Intermittent RF loss observed at different stations. Likely caused by interference, weak signal areas, or antenna alignment issues.";
  if (stationSideWeight > 70) {
    conclusion = `Common Failure (Station Side Issue): High failure counts at specific stations (${topFaultyStations.slice(0, 3).map(s => s.stationId).join(', ')}) affecting multiple trains. This confirms a primary issue at station radio systems, antenna, or power configuration.`;
  } else if (locoSideWeight > 70) {
    conclusion = `Single Train Failure (Loco Issue): Specific locos (${faultyLocos.slice(0, 3).map(l => l.locoId).join(', ')}) showing repeated RF loss across multiple stations. Indicates issues in onboard TCAS/RF modules or loco antenna.`;
  } else if (stationSideWeight > 40 && locoSideWeight > 40) {
    conclusion = "Mixed Failures: Both station-side and loco-side issues detected. Requires combined inspection of identified faulty stations and locos.";
  }

  const stationDeepAnalysis = {
    topFaultyStations,
    faultyLocos,
    criticalEvents: criticalEvents.slice(0, 20),
    rootCause: {
      stationSide: Math.round(stationSideWeight),
      locoSide: Math.round(locoSideWeight),
      conclusion
    }
  };

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
    stationDeepAnalysis
  };
};
