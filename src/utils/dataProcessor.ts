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
  const percentageCol = findColumn(firstRf, 'Percentage', 'Perc', 'Success') || 'Percentage';

  const locoId = firstRf[locoIdCol] || 'N/A';

  // Station Performance
  const stnGroups: Record<string | number, number[]> = {};
  rfData.forEach((row) => {
    const stnId = row[stnIdCol];
    if (stnId !== undefined) {
      if (!stnGroups[stnId]) stnGroups[stnId] = [];
      stnGroups[stnId].push(Number(row[percentageCol]) || 0);
    }
  });

  const stnPerf = Object.entries(stnGroups).map(([stationId, percentages]) => ({
    stationId,
    percentage: percentages.reduce((a, b) => a + b, 0) / percentages.length,
  }));

  const badStns = stnPerf.filter((s) => s.percentage < 95).map((s) => s.stationId);
  const goodStns = stnPerf.filter((s) => s.percentage >= 98).map((s) => s.stationId);
  const locoPerformance = rfData.length > 0
    ? rfData.reduce((acc, row) => acc + (Number(row[percentageCol]) || 0), 0) / rfData.length
    : 0;

  // Radio Data Mapping
  const firstRadio = radioData[0] || {};
  const packetTypeCol = findColumn(firstRadio, 'Packet Type', 'PacketType', 'Type') || 'Packet Type';
  const timeCol = findColumn(firstRadio, 'Time', 'Timestamp', 'Time_DT') || 'Time';

  const arCount = radioData.filter((p) => String(p[packetTypeCol]).toLowerCase().includes('accessrequest')).length;
  const maPacketsRaw = radioData.filter((p) => String(p[packetTypeCol]).toLowerCase().includes('movementauthority'));
  const maCount = maPacketsRaw.length;

  // NMS Logic
  const firstTrn = trnData?.[0] || {};
  const nmsHealthCol = findColumn(firstTrn, 'NMS Health', 'NMSHealth', 'Health') || 'NMS Health';
  const nmsFailRate = trnData
    ? (trnData.filter((row) => String(row[nmsHealthCol]) !== '32').length / trnData.length) * 100
    : 0;

  const nmsStatusMap: Record<string, number> = {};
  trnData?.forEach((row) => {
    const status = String(row[nmsHealthCol]);
    nmsStatusMap[status] = (nmsStatusMap[status] || 0) + 1;
  });
  const nmsStatus = Object.entries(nmsStatusMap).map(([name, value]) => ({ name, value }));

  // Sync/Lag Logic
  const maPacketsProcessed: { time: string; delay: number; category: string }[] = [];
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
    diagnosticAdvice
  };
};
