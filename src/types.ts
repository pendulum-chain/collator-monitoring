export interface ChainConfig {
    name: string;
    wsUrl: string;
    gqlUrl: string;
    ss58Prefix: number;
}

// Used to extract the block data from the GraphQL response
export interface Block {
    height: number;
    timestamp: string;
    validator: string;
}

// Used for the GraphQL query response containing multiple blocks
export interface QueryResult {
    blocks: Block[];
}

// Used to track block production by collator
// Maps collator address to an array of block timestamps
export interface BlockProduction {
    [collator: string]: string[];
}
