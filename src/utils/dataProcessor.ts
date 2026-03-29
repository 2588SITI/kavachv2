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
      Papa.parse(file, {
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
            return newRow;
          });
          resolve(cleaned);
        },
        error: (error) => reject(error),
      });
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        // Clean keys
        const cleaned = jsonData.map((row: any) => {
          const newRow: any = {};
          Object.keys(row).forEach(key => {
            newRow[key.trim()] = row[key];
          });
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
    const found = keys.find(k => k.toLowerCase().replace(/\s/g, '') === alias.toLowerCase().replace(/\s/g, ''));
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
  return new Date(str).getTime();
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
  const rfDateCol = findColumn(firstRf, 'Date', 'Log Date', 'LogDate');
  const rfTimeOnlyCol = findColumn(firstRf, 'Time', 'Log Time', 'LogTime');
  const rfTimestampCol = findColumn(firstRf, 'Timestamp', 'DateTime', 'Date Time', 'Log Time Stamp');
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

  const getRfTime = (row: any) => {
    let rawTime = 'N/A';
    if (rfTimestampCol && row[rfTimestampCol]) rawTime = String(row[rfTimestampCol]);
    else if (rfDateCol && rfTimeOnlyCol && row[rfDateCol] && row[rfTimeOnlyCol]) {
      rawTime = `${row[rfDateCol]} ${row[rfTimeOnlyCol]}`;
    }
    else if (rfTimeOnlyCol && row[rfTimeOnlyCol]) rawTime = String(row[rfTimeOnlyCol]);
    else if (rfDateCol && row[rfDateCol]) rawTime = String(row[rfDateCol]);
    else if (rfKeys[3] && rfKeys[5] && row[rfKeys[3]] && row[rfKeys[5]]) {
      rawTime = `${row[rfKeys[3]]} ${row[rfKeys[5]]}`;
    }
    else if (rfKeys[3] && row[rfKeys[3]]) rawTime = String(row[rfKeys[3]]);
    else if (rfKeys[5] && row[rfKeys[5]]) rawTime = String(row[rfKeys[5]]);
    
    return cleanTimeStr(rawTime);
  };

  const trnTimeCol = findColumn(firstTrn, 'Time', 'Timestamp', 'Date', 'DateTime', 'LogTime') || 'Time';
  const radioTimeCol = findColumn(firstRadio, 'Time', 'Timestamp', 'Time_DT', 'LogTime') || 'Time';

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
  const stnGroups: Record<string, { expected: number[]; received: number[]; percentages: number[]; times: string[]; locoId: string | number }> = {};
  const expectedCol = findColumn(firstRf, 'Expected', 'Exp', 'Total', 'Expected Count') || 'Expected';
  const receivedCol = findColumn(firstRf, 'Received', 'Rec', 'SuccessCount', 'Recieved Count') || 'Received';
  const directionCol = findColumn(firstRf, 'Direction', 'Mode', 'Nominal/Reverse', 'Type', 'Nominal_Reverse') || 'Direction';

  rfData.forEach((row) => {
    const stnId = row[stnIdCol];
    const direction = String(row[directionCol] || 'N/A');
    const rawRowLocoId = row[locoIdCol] || locoId;
    
    // Skip invalid loco IDs
    if (!isValidLocoId(rawRowLocoId)) return;
    
    const rowLocoId = String(rawRowLocoId).trim();
    const key = `${stnId}_${direction}_${rowLocoId}`;
    
    if (stnId !== undefined) {
      if (!stnGroups[key]) stnGroups[key] = { expected: [], received: [], percentages: [], times: [], locoId: rowLocoId };
      stnGroups[key].expected.push(Number(row[expectedCol]) || 0);
      stnGroups[key].received.push(Number(row[receivedCol]) || 0);
      stnGroups[key].percentages.push(Number(row[percentageCol]) || 0);
      const rowTime = getRfTime(row);
      if (rowTime !== 'N/A') stnGroups[key].times.push(rowTime);
    }
  });

  // Calculate average per station per loco for summary
  const stnSummary: Record<string | number, { percentages: number[]; times: string[]; locoId: string | number }> = {};
  Object.entries(stnGroups).forEach(([key, data]) => {
    const [stnId, , rowLocoId] = key.split('_');
    const summaryKey = `${stnId}_${rowLocoId}`;
    if (!stnSummary[summaryKey]) stnSummary[summaryKey] = { percentages: [], times: [], locoId: rowLocoId };
    stnSummary[summaryKey].percentages.push(...data.percentages);
    stnSummary[summaryKey].times.push(...data.times);
  });

  const stnPerf = Object.entries(stnSummary).map(([key, data]) => {
    const [stationId] = key.split('_');
    const sortedTimes = [...data.times].sort();
    return {
      stationId,
      percentage: data.percentages.reduce((a, b) => a + b, 0) / data.percentages.length,
      locoId: data.locoId,
      startTime: sortedTimes.length > 0 ? sortedTimes[0] : 'N/A',
      endTime: sortedTimes.length > 0 ? sortedTimes[sortedTimes.length - 1] : 'N/A'
    };
  });

  const stationStats = Object.entries(stnGroups).map(([key, data]) => {
    const [stationId, direction] = key.split('_');
    const totalExpected = data.expected.reduce((a, b) => a + b, 0);
    const totalReceived = data.received.reduce((a, b) => a + b, 0);
    return {
      stationId,
      direction,
      expected: totalExpected,
      received: totalReceived,
      percentage: (totalReceived / (totalExpected || 1)) * 100,
      locoId: data.locoId
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

  const locoPerformance = rfData.length > 0
    ? rfData
        .filter(row => isValidLocoId(row[locoIdCol] || locoId))
        .reduce((acc, row) => acc + (Number(row[percentageCol]) || 0), 0) / 
        (rfData.filter(row => isValidLocoId(row[locoIdCol] || locoId)).length || 1)
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
      time: String(p[radioTimeCol]),
      type: String(p[packetTypeCol]),
      length: Number(p[lengthCol]),
      locoId: String(p[radioLocoIdCol] || locoId).trim()
    }));

  // SOS Events
  const sosEvents = radioData
    .filter(p => (String(p[packetTypeCol]).toLowerCase().includes('sos') || String(p[messageCol]).toLowerCase().includes('sos')) && isValidLocoId(p[radioLocoIdCol] || locoId))
    .map(p => ({
      time: String(p[radioTimeCol]),
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
        time: String(p[radioTimeCol]),
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
          time: String(row[trnTimeCol] || 'N/A'),
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
    time: String(row[trnTimeCol] || 'N/A'),
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
            time: String(row[trnTimeCol] || 'N/A'),
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
      time: String(row[trnTimeCol] || 'N/A'),
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
      time: String(row[trnTimeCol] || 'N/A'),
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
                time: String(row[trnTimeCol] || 'N/A'), 
                stationId: rowStnId 
              });
            }
          }
        }
        if (lastConfig[param] && lastConfig[param] !== val) {
          trainConfigChanges.push({
            time: String(row[trnTimeCol] || 'N/A'),
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
          time: String(p[radioTimeCol]),
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
  
  // Sort times to find range
  allTimes.sort();
  
  const startTime = allTimes.length > 0 ? allTimes[0] : 'N/A';
  const endTime = allTimes.length > 0 ? allTimes[allTimes.length - 1] : 'N/A';

  return {
    locoId,
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
    modeDegradations,
    shortPackets,
    brakeApplications,
    signalOverrides,
    sosEvents,
    trainConfigChanges,
    uniqueTrainLengths,
    tagLinkIssues,
    multiLocoBadStns,
    startTime,
    endTime
  };
};
