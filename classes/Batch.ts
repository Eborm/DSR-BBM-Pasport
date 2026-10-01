import { Classification} from "../enums/Classification.js";
import { MaterialType } from "../enums/MaterialType.js";
import { SourceFile } from "../enums/SourceFile.js";
import { User } from "./User.js";

export class Batch {
    id: Int32Array;
    producer: string;
    classification: Classification;
    MaterialType: MaterialType;
    mass: Int32Array;
    origin: string;
    installationDate: Date;
    currentOwner: User;
    registeredAt: Date;
    sourceFile: SourceFile;

    constructor(id: Int32Array, producer: string, classification: Classification, MaterialType: MaterialType, mass: Int32Array, origin: string, installationDate: Date, currentOwner: User, sourceFile: SourceFile ) {
        this.id = id;
        this.producer = producer;
        this.classification = classification;
        this.MaterialType = MaterialType;
        this.mass = mass;
        this.origin = origin;
        this.installationDate = installationDate;
        this.currentOwner = currentOwner;
        this.registeredAt = new Date(Date.now());
        this.sourceFile = sourceFile;
    }
}