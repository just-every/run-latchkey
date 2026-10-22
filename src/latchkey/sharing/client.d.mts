export class SharingClient {
 constructor(client: any);
 policy(): Promise<any>; setPolicy(value: any): Promise<any>;
 createGroup(accounts?: string[]): Promise<any>; groupMembers(group: string): Promise<any>; setGroup(group: string,accounts: string[]): Promise<any>;
 grant(vault: string, options: any): Promise<any>; received(): Promise<any>; approve(share: string): Promise<any>; revoke(share: string): Promise<any>;
 read(share: string, object: string, action?: string): Promise<any>; put(share: string,object: string,value: any): Promise<any>;
 history(vault: string,object?: string|null): Promise<any>; revokeLink(link: string): Promise<any>; createLink(vault: string,object: string,options: any): Promise<any>;
}
export class PublicLinkClient {
 constructor(url: string, options?: {fetcher?: typeof fetch});
 preview(): Promise<any>; prepare(password?: string|null): Promise<void>; challenge(recipient: string,password?: string|null): Promise<{challenge: string;expires:number}>; open(challenge: string,code: string): Promise<any>; lock(): void;
}
