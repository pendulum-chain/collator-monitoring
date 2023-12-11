"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const graphql_request_1 = require("graphql-request");
// GraphQL Endpoint
const endpoint = 'https://squid.subsquid.io/foucoco-squid/graphql';
// GraphQL Query (dynamic timestamp will be injected)
const getQuery = (timestamp) => (0, graphql_request_1.gql) `
    {
        blocks(
            limit: 7200, 
            orderBy: timestamp_DESC, 
            where: { timestamp_gte: "${timestamp}" }
        ) {
            height
            timestamp
            validator
        }
    }
`;
// Function to fetch blocks
async function fetchBlocks(timestamp) {
    try {
        const query = getQuery(timestamp);
        const data = await (0, graphql_request_1.request)(endpoint, query);
        console.log(data);
        return data.blocks;
    }
    catch (error) {
        console.error('Error fetching block data:', error);
        throw error;
    }
}
// Function to identify inactive collators
async function identifyInactiveCollators() {
    try {
        // Calculate the timestamp for 24 hours ago
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const blocks = await fetchBlocks(oneDayAgo);
        // Track block production
        const collatorProduction = {};
        blocks.forEach(block => {
            const { validator, timestamp } = block;
            collatorProduction[validator] = collatorProduction[validator] || [];
            collatorProduction[validator].push(timestamp);
        });
        // Determine inactivity
        const inactiveCollators = Object.keys(collatorProduction).filter(validator => {
            const timestamps = collatorProduction[validator];
            // Find the most recent timestamp for the validator
            const lastProductionTime = timestamps.reduce((latest, current) => latest > current ? latest : current, '');
            return lastProductionTime > oneDayAgo;
        });
        console.log('Inactive collators:', inactiveCollators);
    }
    catch (error) {
        console.error('Error identifying inactive collators:', error);
    }
}
// Execute
identifyInactiveCollators();
//slow collators alert or missing collator alert
// polkadot js 
// chains state -> session -> validaotrs
