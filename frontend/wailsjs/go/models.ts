export namespace main {
	
	export class Config {
	    showReasoning: boolean;
	    enableThinking: boolean;
	    logRequests: boolean;
	    contextSize: number;
	    maxTokens: number;
	    temperature: number;
	    streamingEnabled: boolean;
	    currentModel: string;
	    apiKey?: string;
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.showReasoning = source["showReasoning"];
	        this.enableThinking = source["enableThinking"];
	        this.logRequests = source["logRequests"];
	        this.contextSize = source["contextSize"];
	        this.maxTokens = source["maxTokens"];
	        this.temperature = source["temperature"];
	        this.streamingEnabled = source["streamingEnabled"];
	        this.currentModel = source["currentModel"];
	        this.apiKey = source["apiKey"];
	    }
	}
	export class ErrorItem {
	    timestamp: string;
	    message: string;
	    code: number;
	
	    static createFrom(source: any = {}) {
	        return new ErrorItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.timestamp = source["timestamp"];
	        this.message = source["message"];
	        this.code = source["code"];
	    }
	}
	export class Stats {
	    messageCount: number;
	    promptTokens: number;
	    completionTokens: number;
	    totalTokens: number;
	    errorCount: number;
	    lastRequestTime: string;
	    startTime: string;
	    errorLog: ErrorItem[];
	
	    static createFrom(source: any = {}) {
	        return new Stats(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.messageCount = source["messageCount"];
	        this.promptTokens = source["promptTokens"];
	        this.completionTokens = source["completionTokens"];
	        this.totalTokens = source["totalTokens"];
	        this.errorCount = source["errorCount"];
	        this.lastRequestTime = source["lastRequestTime"];
	        this.startTime = source["startTime"];
	        this.errorLog = this.convertValues(source["errorLog"], ErrorItem);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

