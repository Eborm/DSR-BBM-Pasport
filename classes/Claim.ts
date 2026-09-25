import { ClaimType } from "../enums/ClaimType.js";
import { Batch } from "./Batch.js"

export class Claim {
    batchId : Int32Array;
    submitterId : Int32Array;
    documentHash : string;
    timestamp : BigInt64Array;
    claimType : ClaimType;

    constructor(batchId: Int32Array, submitterId : Int32Array, documentHash : string, timestamp: BigInt64Array, claimType: ClaimType) {
        this.batchId = batchId;
        this.submitterId = submitterId;
        this.documentHash = documentHash; //Hash before calling constructor or add in a hashing function in he constructer 
        this.timestamp = timestamp;
        this.claimType = claimType;
    }
}