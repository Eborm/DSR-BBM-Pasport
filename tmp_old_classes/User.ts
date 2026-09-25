import {Role} from "../enums/Role.js";

export class User {
    id: Int32Array;
    role: Role;
    username: string;
    password: string;

    constructor(id : Int32Array, role: Role, username: string, password: string) {
        this.id = id;
        this.role = role;
        this.username = username;
        this.password = password; //Add hashig before calling the constructer or in the constructer
    }
}
