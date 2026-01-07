# Worker Quick Start Guide

## Prerequisites
- Python 3.8 or higher
- Internet connection
- A registered Node ID from the dashboard

## Installation

### Option 1: Using pip
```bash
pip install -r requirements.txt
```

### Option 2: Manual installation
```bash
pip install requests urllib3
```

## Running the Worker

### Basic Usage
```bash
python3 worker.py --node_id YOUR_NODE_ID --api https://app.gstdtoken.com/api/v1
```

### With Docker
```bash
# Build the image
docker build -f Dockerfile.worker -t gstd/worker .

# Run the container
docker run -d --name gstd-worker \
  --restart unless-stopped \
  gstd/worker \
  --node_id=YOUR_NODE_ID \
  --api=https://app.gstdtoken.com/api/v1
```

### With Docker Compose
1. Create a `.env` file:
```bash
NODE_ID=your-node-id-here
API_URL=https://app.gstdtoken.com/api/v1
```

2. Run:
```bash
docker-compose -f docker-compose.worker.yml up -d
```

## Getting Your Node ID

1. Connect your wallet at [app.gstdtoken.com](https://app.gstdtoken.com)
2. Go to Dashboard → Devices tab
3. Click "Register Device"
4. Fill in device name and specs
5. Copy the Node ID from the success message
6. Use this Node ID with the worker script

## Worker Features

- **Automatic Task Fetching**: Polls for tasks every 10 seconds
- **Task Processing**: Handles AI_INFERENCE, DATA_PROCESSING, and COMPUTATION tasks
- **Error Handling**: Automatic retries on network failures
- **Real-time Stats**: Shows tasks completed and total rewards
- **Clean CLI**: Beautiful terminal interface with status updates

## Monitoring

### View Logs (Docker)
```bash
docker logs -f gstd-worker
```

### Check Status
The worker displays:
- Node ID
- API URL
- Online status
- Runtime
- Tasks completed
- Total rewards earned

## Troubleshooting

### "Node not found" error
- Verify your Node ID is correct
- Make sure you registered the node in the dashboard
- Check that you're using the correct API URL

### "No pending tasks"
- This is normal - tasks are assigned as they become available
- The worker will continue polling automatically

### Network errors
- Check your internet connection
- Verify the API URL is accessible
- The worker will automatically retry on failures

## Stopping the Worker

Press `Ctrl+C` to stop the worker gracefully.

For Docker:
```bash
docker stop gstd-worker
```

