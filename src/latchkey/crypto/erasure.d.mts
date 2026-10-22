export function erasureText(statement:Record<string,unknown>):string;
export function validErasureProof(proof:any,expected:Record<string,unknown>,authorityKey:string):Promise<boolean>;
