export function passwordRange(password:string,options?:any):Promise<number>;
export class HealthClient {constructor(client:any,options?:any);inspect(vault:string,options?:any):Promise<any>;history(vault:string):Promise<any[]>;validate(vault:string,revision:number):Promise<void>;suppress(vault:string,finding:any,options:any):Promise<any>;}
