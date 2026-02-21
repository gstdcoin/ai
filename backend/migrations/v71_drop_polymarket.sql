-- Remove Polymarket integration: our direction is our own
DROP TABLE IF EXISTS polymarket_bridge_tasks;
DELETE FROM platform_funds WHERE fund_type = 'polymarket_pool';
