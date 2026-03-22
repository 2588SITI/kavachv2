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
  const locoIdCol = findColumn(firstRf, 'Loco Id', 'LocoId', 'Loco_Id') || 'Loco Id';
  const stnIdCol = findColumn(firstRf, 'Station Id', 'StationId', 'Station_Id') || 'Station Id';
  const percentageCol = findColumn(firstRf, 'Percentage', 'Perc', 'Success', 'RFCOMM %') || 'Percentage';

  const locoId = firstRf[locoIdCol] || 'N/A';

  // Station Performance & Stats
  const stnGroups: Record<string, { expected: number[]; received: number[]; percentages: number[] }> = {};
  const expectedCol = findColumn(firstRf, 'Expected', 'Exp', 'Total', 'Expected Count') || 'Expected';
  const receivedCol = findColumn(firstRf, 'Received', 'Rec', 'SuccessCount', 'Recieved Count') || 'Received';
  const directionCol = findColumn(firstRf, 'Direction', 'Mode', 'Nominal/Reverse', 'Type', 'Nominal_Reverse') || 'Direction';

  rfData.forEach((row) => {
    const stnId = row[stnIdCol];
    const direction = String(row[directionCol] || 'N/A');
    const key = `${stnId}_${direction}`;
    
    if (stnId !== undefined) {
      if (!stnGroups[key]) stnGroups[key] = { expected: [], received: [], percentages: [] };
      stnGroups[key].expected.push(Number(row[expectedCol]) || 0);
      stnGroups[key].received.push(Number(row[receivedCol]) || 0);
      stnGroups[key].percentages.push(Number(row[percentageCol]) || 0);
    }
  });

  // Calculate average per station for summary
  const stnSummary: Record<string | number, number[]> = {};
  Object.entries(stnGroups).forEach(([key, data]) => {
    const stnId = key.split('_')[0];
    if (!stnSummary[stnId]) stnSummary[stnId] = [];
    stnSummary[stnId].push(...data.percentages);
  });

  const stnPerf = Object.entries(stnSummary).map(([stationId, percentages]) => ({
    stationId,
    percentage: percentages.reduce((a, b) => a + b, 0) / percentages.length,
  }));

  const stationStats = Object.entries(stnGroups).map(([key, data]) => {
    const [stationId, direction] = key.split('_');
    const totalExpected = data.expected.reduce((a, b) => a + b, 0);
    const totalReceived = data.received.reduce((a, b) => a + b, 0);
    return {
      stationId,
      direction,
      expected: totalExpected,
      received: totalReceived,
      percentage: (totalReceived / (totalExpected || 1)) * 100
    };
  });

  const badStns = stnPerf.filter((s) => s.percentage < 95).map((s) => s.stationId);
  const goodStns = stnPerf.filter((s) => s.percentage >= 98).map((s) => s.stationId);
  const locoPerformance = rfData.length > 0
    ? rfData.reduce((acc, row) => acc + (Number(row[percentageCol]) || 0), 0) / rfData.length
    : 0;

  // Radio Data Mapping
  const firstRadio = radioData[0] || {};
  const packetTypeCol = findColumn(firstRadio, 'Packet Type', 'PacketType', 'Type') || 'Packet Type';
  const timeCol = findColumn(firstRadio, 'Time', 'Timestamp', 'Time_DT') || 'Time';
  const lengthCol = findColumn(firstRadio, 'Length', 'Len', 'Size') || 'Length';
  const sourceCol = findColumn(firstRadio, 'Source', 'Src', 'From') || 'Source';
  const messageCol = findColumn(firstRadio, 'Message', 'Msg', 'Data') || 'Message';

  const arCount = radioData.filter((p) => String(p[packetTypeCol]).toLowerCase().includes('accessrequest')).length;
  const maPacketsRaw = radioData.filter((p) => String(p[packetTypeCol]).toLowerCase().includes('movementauthority'));
  const maCount = maPacketsRaw.length;

  // Short Packets (< 10)
  const shortPackets = radioData
    .filter(p => Number(p[lengthCol]) < 10 && p[lengthCol] !== undefined)
    .map(p => ({
      time: String(p[timeCol]),
      type: String(p[packetTypeCol]),
      length: Number(p[lengthCol])
    }));

  // SOS Events
  const sosEvents = radioData
    .filter(p => String(p[packetTypeCol]).toLowerCase().includes('sos') || String(p[messageCol]).toLowerCase().includes('sos'))
    .map(p => ({
      time: String(p[timeCol]),
      source: String(p[sourceCol] || 'Unknown'),
      type: String(p[packetTypeCol])
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
        time: String(p[timeCol]),
        stationId: String(p[stnIdCol] || 'N/A'),
        info: info,
        error: errorType
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
          time: String(row[timeCol] || 'N/A'),
          stationId: String(row[findColumn(row, 'Station Id', 'StationId', 'Station_Id') || ''] || 'N/A'),
          info: String(row[trnTagLinkCol]),
          error: errorType
        });
      }
    });
  }

  const tagLinkIssues = [...radioTagIssues, ...trnTagIssues].sort((a, b) => a.time.localeCompare(b.time));

  // NMS Logic
  const firstTrn = trnData?.[0] || {};
  const nmsHealthCol = findColumn(firstTrn, 'NMS Health', 'NMSHealth', 'Health') || 'NMS Health';
  const modeCol = findColumn(firstTrn, 'Mode', 'CurrentMode', 'OpMode') || 'Mode';
  const eventCol = findColumn(firstTrn, 'Event', 'Description', 'LogEntry') || 'Event';
  const reasonCol = findColumn(firstTrn, 'Reason', 'Cause', 'FaultReason') || 'Reason';
  const lpResponseCol = findColumn(firstTrn, 'LP Response', 'DriverAction', 'Response') || 'LP Response';
  const speedCol = findColumn(firstTrn, 'Speed', 'Velocity', 'Kmph') || 'Speed';
  const locationCol = findColumn(firstTrn, 'Location', 'Km', 'Position') || 'Location';
  const signalIdCol = findColumn(firstTrn, 'Signal Id', 'SignalId', 'SigId') || 'Signal Id';
  const signalStatusCol = findColumn(firstTrn, 'Signal Status', 'SignalStatus', 'SigStatus') || 'Signal Status';

  const nmsFailRate = trnData
    ? (trnData.filter((row) => String(row[nmsHealthCol]) !== '32').length / trnData.length) * 100
    : 0;

  const nmsStatusMap: Record<string, number> = {};
  trnData?.forEach((row) => {
    const status = String(row[nmsHealthCol]);
    nmsStatusMap[status] = (nmsStatusMap[status] || 0) + 1;
  });
  const nmsStatus = Object.entries(nmsStatusMap).map(([name, value]) => ({ name, value }));

  // Mode Degradation
  const modeDegradations: DashboardStats['modeDegradations'] = [];
  let lastMode: string | null = null;
  trnData?.forEach((row) => {
    const currentMode = String(row[modeCol]);
    if (lastMode && currentMode !== lastMode) {
      // Check if it's a degradation (e.g., FS -> OS)
      const isDegradation = (lastMode === 'FS' && currentMode !== 'FS') || 
                            (lastMode === 'OS' && (currentMode === 'SR' || currentMode === 'SH'));
      if (isDegradation) {
        modeDegradations.push({
          time: String(row[timeCol] || 'N/A'),
          from: lastMode,
          to: currentMode,
          reason: String(row[reasonCol] || row[eventCol] || 'Unknown'),
          lpResponse: String(row[lpResponseCol] || 'No Response Logged')
        });
      }
    }
    lastMode = currentMode;
  });

  // Brake Applications
  const brakeApplications = trnData
    ?.filter(row => {
      const event = String(row[eventCol] || '').toLowerCase();
      return event.includes('brake') || event.includes('eb applied') || event.includes('sb applied');
    })
    .map(row => ({
      time: String(row[timeCol] || 'N/A'),
      type: String(row[eventCol]),
      speed: Number(row[speedCol]) || 0,
      location: String(row[locationCol] || 'N/A')
    })) || [];

  // Signal Overrides
  const signalOverrides = trnData
    ?.filter(row => String(row[eventCol] || '').toLowerCase().includes('override'))
    .map(row => ({
      time: String(row[timeCol] || 'N/A'),
      signalId: String(row[signalIdCol] || 'N/A'),
      status: String(row[signalStatusCol] || 'Overridden')
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
                time: String(row[timeCol] || 'N/A'), 
                stationId: rowStnId 
              });
            }
          }
        }
        if (lastConfig[param] && lastConfig[param] !== val) {
          trainConfigChanges.push({
            time: String(row[timeCol] || 'N/A'),
            parameter: param,
            oldVal: lastConfig[param],
            newVal: val,
            stationId: rowStnId
          });
        }
        lastConfig[param] = val;
      }
    });
  });

  const uniqueTrainLengths = Array.from(uniqueTrainLengthsMap.entries())
    .map(([length, info]) => ({ length, ...info }))
    .sort((a, b) => a.length - b.length);

  // Sync/Lag Logic
  const maPacketsProcessed: { time: string; delay: number; category: string; length: number }[] = [];
  let lastTime: number | null = null;

  maPacketsRaw.forEach((p, i) => {
    const currentTime = parseTime(p[timeCol]);
    if (i > 0 && lastTime !== null && !isNaN(currentTime)) {
      const delay = (currentTime - lastTime) / 1000;
      if (delay >= 0) { // Filter out negative delays if any
        maPacketsProcessed.push({
          time: String(p[timeCol]),
          delay,
          category: bucketDelay(delay),
          length: Number(p[lengthCol]) || 0
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

  if (diagnosticAdvice.length === 0) {
    diagnosticAdvice.push({
      title: "System Healthy",
      detail: "All parameters are within normal RDSO limits.",
      action: "Routine: Perform weekly visual inspection of all RF connectors and ensure all modules are properly seated.",
      severity: 'low'
    });
  }

  return {
    locoId,
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
    tagLinkIssues
  };
};
