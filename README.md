## Description
This script is ran periodically in order to monitor collator performance. 
Collator addresses are fetched from the chain state while data about the blocks authored in the last 24 hours (last 7200 blocks) is fetched from the Subsquid indexer.
Data is then processed and results are sent to our Slack channel.
There are 2 cases in which this script will report it's findings:
- Inactive collators - collators who haven't authored any blocks in the last 24 hours
- Slow collators - collators who have authored less blocks than the set threshold `(expectedBlocksPerCollator * PERCENTAGE / 100)` in the last 24 hours

## Environment variables:

### Mandatory

- `SLACK_WEB_HOOK_TOKEN` - Slack web hook token for collator performance reporting.

### Optional

- `PERCENTAGE` - The percentage of the average number of blocks authored per collator in 24 hours which is considered to be acceptable collator performance. Defaults to `75`.
- `WAIT_TIME_DAYS` - The number of days to wait before reporting collators who haven't authored any blocks. Defaults to `7`.