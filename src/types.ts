/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface RFData {
  'Loco Id': string | number;
  'Station Id': string | number;
  'Percentage': number;
  [key: string]: any;
}

export interface TRNData {
  'NMS Health': string | number;
  [key: string]: any;
}

export interface RadioData {
  'Packet Type': string;
  'Time': string;
  [key: string]: any;
}

export interface DashboardStats {
  locoId: string | number;
  logDate?: string | null;
  allDates: string[];
  locoIds: (string | number)[];
  stnPerf: { stationId: string | number; percentage: number; locoId: string | number; date?: string }[];
  badStns: (string | number)[];
  goodStns: (string | number)[];
  locoPerformance: number;
  arCount: number;
  maCount: number;
  nmsFailRate: number;
  avgLag: number;
  maPackets: { time: string; delay: number; category: string; length: number; locoId: string | number }[];
  nmsStatus: { name: string; value: number }[];
  nmsLogs: { time: string; health: string; locoId: string | number }[];
  intervalDist: { category: string; percentage: number }[];
  diagnosticAdvice: { title: string; detail: string; action: string; severity: 'high' | 'medium' | 'low' }[];
  
  // New Expert Fields
  stationStats: { 
    stationId: string | number; 
    direction: string;
    expected: number; 
    received: number; 
    percentage: number;
    locoId: string | number;
    date?: string;
  }[];
  modeDegradations: { time: string; from: string; to: string; reason: string; lpResponse: string; stationId: string; locoId: string | number }[];
  shortPackets: { time: string; type: string; length: number; locoId: string | number }[];
  brakeApplications: { time: string; type: string; speed: number; location: string; stationId: string; locoId: string | number }[];
  signalOverrides: { time: string; signalId: string; status: string; stationId: string; locoId: string | number }[];
  sosEvents: { time: string; source: string; type: string; stationId: string; locoId: string | number }[];
  trainConfigChanges: { time: string; parameter: string; oldVal: string; newVal: string; stationId: string; locoId: string | number }[];
  uniqueTrainLengths: { length: number; time: string; stationId: string; locoId: string | number }[];
  tagLinkIssues: { time: string; stationId: string; info: string; error: string; locoId: string | number }[];
  multiLocoBadStns: { 
    stationId: string | number; 
    locoCount: number; 
    avgPerf: number; 
    locoDetails: { id: string | number; perf: number; startTime: string; endTime: string }[] 
  }[];
  stationRadioPackets: {
    time: string;
    stationId: string;
    packets: { [key: string]: any };
    locoId: string | number;
  }[];
  startTime: string;
  endTime: string;
  
  // Deep Analysis Fields
  stationDeepAnalysis: {
    topFaultyStations: {
      stationId: string | number;
      failureCount: number;
      avgLossDuration: number;
      healthScore: number;
      status: 'Critical' | 'Warning' | 'Healthy';
      affectedLocos: (string | number)[];
    }[];
    faultyLocos: {
      locoId: string | number;
      failureCount: number;
      stationsCovered: (string | number)[];
      status: 'Normal' | 'Suspect' | 'Critical';
    }[];
    criticalEvents: {
      time: string;
      stationId: string | number;
      locoId: string | number;
      duration: number;
      type: 'Long Duration' | 'Multiple Trains Affected';
      description: string;
    }[];
    rootCause: {
      stationSide: number;
      locoSide: number;
      conclusion: string;
    };
  };
}

export const bucketDelay = (d: number) => {
  if (d <= 1.0) return "<= 1s (Normal)";
  if (d <= 2.0) return "1s - 2s (Delayed)";
  return "> 2s (Timeout)";
};
