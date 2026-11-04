export class SelectionExportClient {
 constructor(client: any);
 preview(selection: any, options?: any): Promise<any>;
 setPlaintextPolicy(vault: string, allowPlaintext: boolean, options?: any): Promise<any>;
 export(preview: any, exportKey: string | null, options?: any): Promise<any>;
 reportOutcome(outcome: string): Promise<any>;
 static open(archive: any, exportKey?: string | null): Promise<any>;
 reimport(archive: any, exportKey: string | null, options?: any): Promise<any>;
}
