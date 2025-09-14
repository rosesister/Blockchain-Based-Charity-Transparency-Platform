import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV, principalCV, noneCV, someCV, tupleCV, listCV } from "@stacks/transactions";

const ERR_NOT_REGISTERED = 101;
const ERR_INVALID_DATA = 102;
const ERR_NOT_AUTHORIZED = 103;
const ERR_INVALID_WEIGHT = 104;
const ERR_INVALID_SCORE = 105;
const ERR_ALREADY_SCORED = 106;
const ERR_NO_SUBMISSION = 107;
const ERR_AUTHORITY_NOT_SET = 109;
const ERR_INVALID_AUDITOR = 110;

interface Submission {
  financialData: number;
  operationalData: number;
  impactData: number;
  timestamp: number;
}

interface Score {
  score: number;
  lastUpdated: number;
  submissionId: number;
}

interface Auditor {
  verified: boolean;
  reputation: number;
}

interface HistoryEntry {
  score: number;
  timestamp: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class ScoringEngineMock {
  state: {
    financialWeight: number;
    operationalWeight: number;
    impactWeight: number;
    maxScore: number;
    authorityContract: string | null;
    scoringFee: number;
    charityScores: Map<string, Score>;
    dataSubmissions: Map<string, Submission>;
    auditors: Map<string, Auditor>;
    scoreHistory: Map<string, HistoryEntry[]>;
  } = {
    financialWeight: 40,
    operationalWeight: 30,
    impactWeight: 30,
    maxScore: 100,
    authorityContract: null,
    scoringFee: 500,
    charityScores: new Map(),
    dataSubmissions: new Map(),
    auditors: new Map(),
    scoreHistory: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1CHARITY";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];
  registryMock: Map<string, { creator: string }> = new Map();

  reset() {
    this.state = {
      financialWeight: 40,
      operationalWeight: 30,
      impactWeight: 30,
      maxScore: 100,
      authorityContract: null,
      scoringFee: 500,
      charityScores: new Map(),
      dataSubmissions: new Map(),
      auditors: new Map(),
      scoreHistory: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1CHARITY";
    this.stxTransfers = [];
    this.registryMock.clear();
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (this.state.authorityContract !== null) return { ok: false, value: false };
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setWeights(financial: number, operational: number, impact: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    if (financial + operational + impact !== 100 || financial <= 0 || operational <= 0 || impact <= 0) {
      return { ok: false, value: false };
    }
    this.state.financialWeight = financial;
    this.state.operationalWeight = operational;
    this.state.impactWeight = impact;
    return { ok: true, value: true };
  }

  setScoringFee(newFee: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.scoringFee = newFee;
    return { ok: true, value: true };
  }

  registerAuditor(auditor: string): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    if (this.state.auditors.has(auditor)) return { ok: false, value: false };
    this.state.auditors.set(auditor, { verified: true, reputation: 0 });
    return { ok: true, value: true };
  }

  submitData(charity: string, financialData: number, operationalData: number, impactData: number): Result<boolean> {
    if (!this.registryMock.has(charity)) return { ok: false, value: false };
    if (financialData <= 0 || financialData > 100 || operationalData <= 0 || operationalData > 100 || impactData <= 0 || impactData > 100) {
      return { ok: false, value: false };
    }
    this.state.dataSubmissions.set(charity, { financialData, operationalData, impactData, timestamp: this.blockHeight });
    return { ok: true, value: true };
  }

  calculateScore(charity: string, submissionId: number): Result<number> {
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_SET };
    if (!this.registryMock.has(charity)) return { ok: false, value: ERR_NOT_REGISTERED };
    if (this.registryMock.get(charity)!.creator !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.charityScores.has(charity)) return { ok: false, value: ERR_ALREADY_SCORED };
    const submission = this.state.dataSubmissions.get(charity);
    if (!submission) return { ok: false, value: ERR_NO_SUBMISSION };
    this.stxTransfers.push({ amount: this.state.scoringFee, from: this.caller, to: this.state.authorityContract });
    const score = submission.financialData * this.state.financialWeight + submission.operationalData * this.state.operationalWeight + submission.impactData * this.state.impactWeight;
    if (score > this.state.maxScore) return { ok: false, value: ERR_INVALID_SCORE };
    this.state.charityScores.set(charity, { score, lastUpdated: this.blockHeight, submissionId });
    const history = this.state.scoreHistory.get(charity) || [];
    this.state.scoreHistory.set(charity, [{ score, timestamp: this.blockHeight }, ...history.slice(0, 49)]);
    return { ok: true, value: score };
  }

  verifySubmission(charity: string, submissionId: number): Result<boolean> {
    const auditor = this.state.auditors.get(this.caller);
    if (!auditor || !auditor.verified) return { ok: false, value: false };
    if (!this.state.dataSubmissions.has(charity)) return { ok: false, value: false };
    this.state.auditors.set(this.caller, { verified: true, reputation: auditor.reputation + 10 });
    return { ok: true, value: true };
  }

  getScore(charity: string): Score | null {
    return this.state.charityScores.get(charity) || null;
  }

  getSubmission(charity: string): Submission | null {
    return this.state.dataSubmissions.get(charity) || null;
  }

  getScoreHistory(charity: string): HistoryEntry[] | null {
    return this.state.scoreHistory.get(charity) || null;
  }

  getAuditor(auditor: string): Auditor | null {
    return this.state.auditors.get(auditor) || null;
  }

  getWeights(): { financial: number; operational: number; impact: number } {
    return {
      financial: this.state.financialWeight,
      operational: this.state.operationalWeight,
      impact: this.state.impactWeight,
    };
  }
}

describe("ScoringEngine", () => {
  let contract: ScoringEngineMock;

  beforeEach(() => {
    contract = new ScoringEngineMock();
    contract.reset();
    contract.registryMock.set("ST1CHARITY", { creator: "ST1CHARITY" });
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2AUTH");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityContract).toBe("ST2AUTH");
  });

  it("submits data successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.submitData("ST1CHARITY", 80, 70, 90);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const submission = contract.getSubmission("ST1CHARITY");
    expect(submission).toEqual({ financialData: 80, operationalData: 70, impactData: 90, timestamp: 0 });
  });
  
  it("verifies submission successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.registerAuditor("ST3AUDITOR");
    contract.submitData("ST1CHARITY", 80, 70, 90);
    contract.caller = "ST3AUDITOR";
    const result = contract.verifySubmission("ST1CHARITY", 1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const auditor = contract.getAuditor("ST3AUDITOR");
    expect(auditor).toEqual({ verified: true, reputation: 10 });
  });

  it("sets weights successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.setWeights(50, 30, 20);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getWeights()).toEqual({ financial: 50, operational: 30, impact: 20 });
  });

  it("rejects invalid weights", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.setWeights(60, 30, 20);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects submission with invalid data", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.submitData("ST1CHARITY", 101, 70, 90);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects score calculation for unregistered charity", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.calculateScore("ST2UNKNOWN", 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_REGISTERED);
  });

  it("rejects score calculation by non-creator", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.submitData("ST1CHARITY", 80, 70, 90);
    contract.caller = "ST2FAKE";
    const result = contract.calculateScore("ST1CHARITY", 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects verification by invalid auditor", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.submitData("ST1CHARITY", 80, 70, 90);
    contract.caller = "ST3AUDITOR";
    const result = contract.verifySubmission("ST1CHARITY", 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });
});