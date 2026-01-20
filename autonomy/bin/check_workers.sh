#!/bin/bash
# Check Active Workers
COUNT=$(docker exec gstd_postgres_prod psql -U postgres -d distributed_computing -t -c "SELECT count(*) FROM nodes WHERE status = 'active';")
echo $COUNT | xargs # Trim whitespace
