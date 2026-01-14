#!/bin/bash

# Copyright OpenSearch Contributors
# SPDX-License-Identifier: Apache-2.0

# AgentEval Setup Script
# Automates the complete setup of AgentEval environment with ML-Commons AG-UI agent
#
# Usage:
#   ./scripts/setup.sh                  # Quick start: fetch creds, register new agent, update .env, start servers
#   ./scripts/setup.sh --setup-opensearch # Full setup: clone + build OpenSearch/ML-Commons + configure + start
#   ./scripts/setup.sh --stop           # Stop all running services
#   ./scripts/setup.sh --status         # Check which services are running

set -e

# ============================================================================
# CONFIGURATION
# ============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values (can be overridden by environment variables)
WORKSPACE_DIR="${WORKSPACE_DIR:-$HOME/agenteval-workspace}"
AWS_REGION="${AWS_REGION:-us-east-1}"
BEDROCK_MODEL="${BEDROCK_MODEL:-us.anthropic.claude-sonnet-4-20250514-v1:0}"
MCP_SERVER_PORT="${MCP_SERVER_PORT:-3030}"
MLCOMMONS_PORT=9200
SERVER_PORT=4001  # Unified server port (serves both API and UI)

# Script directory (where this script lives)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Note: We use port-based cleanup instead of PID files for reliability

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "\n${GREEN}========================================${NC}"
    echo -e "${GREEN}STEP $1: $2${NC}"
    echo -e "${GREEN}========================================${NC}\n"
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 is not installed"
        return 1
    fi
    return 0
}

wait_for_service() {
    local url=$1
    local max_attempts=${2:-60}
    local attempt=1

    log_info "Waiting for $url to be ready..."
    while [ $attempt -le $max_attempts ]; do
        if curl -s "$url" > /dev/null 2>&1; then
            log_success "$url is ready"
            return 0
        fi
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    echo ""
    log_error "Timeout waiting for $url"
    return 1
}


cleanup_ports() {
    log_info "Cleaning up existing processes on ports..."
    for port in $MCP_SERVER_PORT $SERVER_PORT; do
        local pid=$(lsof -ti:$port 2>/dev/null || true)
        if [ -n "$pid" ]; then
            log_info "Killing existing process on port $port (PID: $pid)..."
            kill $pid 2>/dev/null || true
            sleep 1
        fi
    done
}

cleanup_on_exit() {
    echo ""
    log_info "Shutting down services..."
    for port in $MCP_SERVER_PORT $SERVER_PORT; do
        local pid=$(lsof -ti:$port 2>/dev/null || true)
        if [ -n "$pid" ]; then
            log_info "Stopping process on port $port (PID: $pid)..."
            kill $pid 2>/dev/null || true
        fi
    done
    log_success "All services stopped"
}

trap cleanup_on_exit EXIT INT TERM

# ============================================================================
# COMMAND HANDLERS
# ============================================================================

show_status() {
    log_info "Checking service status..."

    echo -e "\n${BLUE}Service Status:${NC}"
    echo "----------------------------------------"

    # Check ML-Commons
    if curl -s "http://localhost:$MLCOMMONS_PORT" > /dev/null 2>&1; then
        echo -e "ML-Commons (port $MLCOMMONS_PORT):     ${GREEN}RUNNING${NC}"
    else
        echo -e "ML-Commons (port $MLCOMMONS_PORT):     ${RED}NOT RUNNING${NC}"
    fi

    # Check MCP Server
    if curl -s "http://localhost:$MCP_SERVER_PORT/health" > /dev/null 2>&1; then
        echo -e "MCP Server (port $MCP_SERVER_PORT):      ${GREEN}RUNNING${NC}"
    else
        echo -e "MCP Server (port $MCP_SERVER_PORT):      ${RED}NOT RUNNING${NC}"
    fi

    # Check Unified Server (Backend + Frontend)
    if curl -s "http://localhost:$SERVER_PORT/health" > /dev/null 2>&1; then
        echo -e "Unified Server (port $SERVER_PORT):    ${GREEN}RUNNING${NC}"
        echo -e "  UI available at: http://localhost:$SERVER_PORT"
    else
        echo -e "Unified Server (port $SERVER_PORT):    ${RED}NOT RUNNING${NC}"
    fi

    echo "----------------------------------------"
}

stop_services() {
    log_info "Stopping all services..."

    for port in $MLCOMMONS_PORT $MCP_SERVER_PORT $SERVER_PORT; do
        local pid=$(lsof -ti:$port 2>/dev/null || true)
        if [ -n "$pid" ]; then
            log_info "Stopping process on port $port (PID: $pid)..."
            kill $pid 2>/dev/null || true
        fi
    done

    log_success "All services stopped"
}

# ============================================================================
# PREREQUISITES CHECK
# ============================================================================

check_prerequisites() {
    log_step "1" "Checking Prerequisites"

    local all_ok=true

    # Check Java
    if check_command java; then
        local java_version=$(java -version 2>&1 | head -1 | cut -d'"' -f2 | cut -d'.' -f1)
        if [ "$java_version" -ge 11 ] 2>/dev/null; then
            log_success "Java $java_version found"
        else
            log_error "Java 11+ required, found version $java_version"
            all_ok=false
        fi
    else
        all_ok=false
    fi

    # Check Node.js
    if check_command node; then
        local node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$node_version" -ge 18 ] 2>/dev/null; then
            log_success "Node.js v$node_version found"
        else
            log_error "Node.js 18+ required, found v$node_version"
            all_ok=false
        fi
    else
        all_ok=false
    fi

    # Check Python/uvx
    if check_command uvx; then
        log_success "uvx found"
    else
        log_warn "uvx not found - install with: pip install uvx"
        all_ok=false
    fi

    # Check git
    if check_command git; then
        log_success "git found"
    else
        all_ok=false
    fi

    # Check curl
    if check_command curl; then
        log_success "curl found"
    else
        all_ok=false
    fi

    # Check ada (for AWS credentials)
    if check_command ada; then
        log_success "ada found"
    else
        log_warn "ada not found - you'll need to manually set AWS credentials"
    fi

    if [ "$all_ok" = false ]; then
        log_error "Prerequisites check failed. Please install missing dependencies."
        exit 1
    fi

    log_success "All prerequisites satisfied"
}

# ============================================================================
# CLONE & BUILD OPENSEARCH CORE
# ============================================================================

setup_opensearch_core() {
    log_step "2" "Setting up OpenSearch Core (Streaming Plugins)"

    mkdir -p "$WORKSPACE_DIR"
    cd "$WORKSPACE_DIR"

    if [ -d "OpenSearch" ]; then
        log_info "OpenSearch directory already exists, skipping clone"
        cd OpenSearch
    else
        log_info "Cloning OpenSearch..."
        git clone https://github.com/opensearch-project/OpenSearch
        cd OpenSearch
    fi

    log_info "Building streaming plugins..."
    ./gradlew :plugins:transport-reactor-netty4:assemble
    ./gradlew :plugins:arrow-flight-rpc:assemble

    export OPENSEARCH_CORE_PATH=$(pwd)
    log_success "OpenSearch Core ready at: $OPENSEARCH_CORE_PATH"
}

# ============================================================================
# CLONE & START ML-COMMONS
# ============================================================================

setup_mlcommons() {
    log_step "3" "Setting up ML-Commons"

    cd "$WORKSPACE_DIR"

    if [ -d "ml-commons" ]; then
        log_info "ml-commons directory already exists, skipping clone"
        cd ml-commons
    else
        log_info "Cloning ML-Commons..."
        git clone https://github.com/jiapingzeng/ml-commons
        cd ml-commons
        git switch 3.4-jpz
    fi

    log_info "Starting ML-Commons with streaming enabled..."
    ./gradlew run -Dstreaming=true &
    local mlcommons_pid=$!

    wait_for_service "http://localhost:$MLCOMMONS_PORT" 120
    log_success "ML-Commons started (PID: $mlcommons_pid)"
}

# ============================================================================
# START MCP SERVER
# ============================================================================

start_mcp_server() {
    log_step "4" "Starting MCP Server"

    # Load MCP config from .env if available
    if [ -f "$PROJECT_ROOT/.env" ]; then
        export MCP_OPENSEARCH_URL=$(grep "^MCP_OPENSEARCH_URL=" "$PROJECT_ROOT/.env" | cut -d'=' -f2-)
        export MCP_OPENSEARCH_USERNAME=$(grep "^MCP_OPENSEARCH_USERNAME=" "$PROJECT_ROOT/.env" | cut -d'=' -f2-)
        export MCP_OPENSEARCH_PASSWORD=$(grep "^MCP_OPENSEARCH_PASSWORD=" "$PROJECT_ROOT/.env" | cut -d'=' -f2-)
    fi

    log_info "Starting OpenSearch MCP Server on port $MCP_SERVER_PORT..."
    log_info "Connecting to OpenSearch: $MCP_OPENSEARCH_URL"
    OPENSEARCH_URL="$MCP_OPENSEARCH_URL" \
    OPENSEARCH_USERNAME="$MCP_OPENSEARCH_USERNAME" \
    OPENSEARCH_PASSWORD="$MCP_OPENSEARCH_PASSWORD" \
    uvx opensearch-mcp-server-py@0.5.2 --transport stream --port $MCP_SERVER_PORT &
    local mcp_pid=$!

    sleep 3
    log_success "MCP Server started (PID: $mcp_pid)"
}

# ============================================================================
# REFRESH AWS CREDENTIALS
# ============================================================================

refresh_aws_credentials() {
    log_info "Refreshing AWS credentials..."

    if command -v ada &> /dev/null; then
        ada credentials update --account ${AWS_BEDROCK_ACCOUNT:-YOUR_AWS_ACCOUNT_ID} --role ${AWS_BEDROCK_ROLE:-Admin} --once

        # Parse credentials from ~/.aws/credentials or environment
        # ada typically exports these automatically, but let's ensure they're set
        if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
            log_warn "AWS credentials not in environment. Attempting to read from ~/.aws/credentials..."

            # Try to read from credentials file
            if [ -f ~/.aws/credentials ]; then
                export AWS_ACCESS_KEY_ID=$(grep -A 3 '\[default\]' ~/.aws/credentials | grep aws_access_key_id | cut -d'=' -f2 | tr -d ' ')
                export AWS_SECRET_ACCESS_KEY=$(grep -A 3 '\[default\]' ~/.aws/credentials | grep aws_secret_access_key | cut -d'=' -f2 | tr -d ' ')
                export AWS_SESSION_TOKEN=$(grep -A 3 '\[default\]' ~/.aws/credentials | grep aws_session_token | cut -d'=' -f2 | tr -d ' ')
            fi
        fi
    else
        log_warn "ada not available. Using existing AWS credentials from environment."
    fi

    # Verify credentials are set
    if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
        log_error "AWS credentials not found. Please set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_SESSION_TOKEN"
        exit 1
    fi

    log_success "AWS credentials configured"
}

# ============================================================================
# CONFIGURE ML-COMMONS (5 API Calls)
# ============================================================================

configure_mlcommons() {
    log_step "5" "Configuring ML-Commons (5 API calls)"

    local endpoint="http://localhost:$MLCOMMONS_PORT"

    # -------------------------------------------------------------------------
    # API 1: Enable streaming
    # -------------------------------------------------------------------------
    log_info "API 1: Enabling streaming settings..."

    curl -s -X PUT "$endpoint/_cluster/settings" \
        -H "Content-Type: application/json" \
        -d '{
            "persistent": {
                "plugins.ml_commons.trusted_connector_endpoints_regex": [
                    "http://localhost:3030",
                    "^https://bedrock-runtime\\..*[a-z0-9-]\\.amazonaws\\.com/.*$"
                ],
                "plugins.ml_commons.stream_enabled": true,
                "plugins.ml_commons.mcp_connector_enabled": true,
                "plugins.ml_commons.ag_ui_enabled": true,
                "plugins.ml_commons.mcp_header_passthrough_enabled": true,
                "logger.org.opensearch.ml": "DEBUG"
            }
        }' > /dev/null

    log_success "Streaming settings enabled"

    # -------------------------------------------------------------------------
    # Refresh AWS Credentials (before model registration)
    # -------------------------------------------------------------------------
    refresh_aws_credentials

    # -------------------------------------------------------------------------
    # API 2: Register Bedrock model
    # -------------------------------------------------------------------------
    log_info "API 2: Registering Bedrock model ($BEDROCK_MODEL)..."

    local model_response=$(curl -s -X POST "$endpoint/_plugins/_ml/models/_register?deploy=true" \
        -H "Content-Type: application/json" \
        -d '{
            "name": "Claude Sonnet",
            "function_name": "remote",
            "description": "Claude Sonnet via Bedrock",
            "connector": {
                "name": "Bedrock Converse Connector",
                "description": "Bedrock Converse Connector",
                "version": 1,
                "protocol": "aws_sigv4",
                "parameters": {
                    "region": "'"$AWS_REGION"'",
                    "model": "'"$BEDROCK_MODEL"'",
                    "service_name": "bedrock"
                },
                "credential": {
                    "access_key": "'"$AWS_ACCESS_KEY_ID"'",
                    "secret_key": "'"$AWS_SECRET_ACCESS_KEY"'",
                    "session_token": "'"$AWS_SESSION_TOKEN"'"
                },
                "actions": [
                    {
                        "action_type": "predict",
                        "method": "POST",
                        "url": "https://bedrock-runtime.${parameters.region}.amazonaws.com/model/${parameters.model}/converse",
                        "request_body": "{\"messages\": [${parameters._chat_history:-}{\"role\":\"user\",\"content\":[{\"text\":\"${parameters.prompt}\"}]}${parameters._interactions:-}]${parameters.tool_configs:-}}"
                    }
                ]
            }
        }')

    MODEL_ID=$(echo "$model_response" | grep -o '"model_id":"[^"]*"' | cut -d'"' -f4)

    if [ -z "$MODEL_ID" ]; then
        log_error "Failed to register model. Response: $model_response"
        exit 1
    fi

    log_success "Model registered: $MODEL_ID"

    # -------------------------------------------------------------------------
    # API 3: Create MCP connector
    # -------------------------------------------------------------------------
    log_info "API 3: Creating MCP connector..."

    local connector_response=$(curl -s -X POST "$endpoint/_plugins/_ml/connectors/_create" \
        -H "Content-Type: application/json" \
        -d '{
            "name": "OpenSearch MCP Server",
            "description": "OpenSearch MCP Server",
            "version": 1,
            "protocol": "mcp_streamable_http",
            "url": "http://localhost:'"$MCP_SERVER_PORT"'",
            "parameters": {
                "endpoint": "/mcp/"
            }
        }')

    MCP_CONNECTOR_ID=$(echo "$connector_response" | grep -o '"connector_id":"[^"]*"' | cut -d'"' -f4)

    if [ -z "$MCP_CONNECTOR_ID" ]; then
        log_error "Failed to create MCP connector. Response: $connector_response"
        exit 1
    fi

    log_success "MCP Connector created: $MCP_CONNECTOR_ID"

    # -------------------------------------------------------------------------
    # API 4: Register AG-UI agent
    # -------------------------------------------------------------------------
    log_info "API 4: Registering AG-UI agent..."

    local agent_response=$(curl -s -X POST "$endpoint/_plugins/_ml/agents/_register" \
        -H "Content-Type: application/json" \
        -d '{
            "name": "AG-UI chat agent",
            "type": "AG_UI",
            "description": "AgentEval AG-UI agent",
            "llm": {
                "model_id": "'"$MODEL_ID"'",
                "parameters": {
                    "max_iteration": 50,
                    "system_prompt": "You are a helpful assistant.",
                    "prompt": "Context:${parameters.context}\nQuestion:${parameters.question}"
                }
            },
            "parameters": {
                "_llm_interface": "bedrock/converse/claude",
                "mcp_connectors": [
                    {
                        "mcp_connector_id": "'"$MCP_CONNECTOR_ID"'"
                    }
                ]
            },
            "tools": []
        }')

    AGENT_ID=$(echo "$agent_response" | grep -o '"agent_id":"[^"]*"' | cut -d'"' -f4)

    if [ -z "$AGENT_ID" ]; then
        log_error "Failed to register agent. Response: $agent_response"
        exit 1
    fi

    log_success "Agent registered: $AGENT_ID"

    # -------------------------------------------------------------------------
    # API 5: Test execute agent (MANDATORY verification)
    # -------------------------------------------------------------------------
    log_info "API 5: Testing agent execution..."

    local test_response=$(curl -s -X POST "$endpoint/_plugins/_ml/agents/$AGENT_ID/_execute/stream" \
        -H "Content-Type: application/json" \
        -d '{
            "threadId": "test-thread-setup",
            "runId": "test-run-setup",
            "messages": [
                {
                    "id": "test-msg-setup",
                    "role": "user",
                    "content": "hello"
                }
            ],
            "tools": [],
            "context": [],
            "state": {},
            "forwardedProps": {}
        }')

    if echo "$test_response" | grep -q "RUN_STARTED"; then
        log_success "Agent test successful - RUN_STARTED event received"
    else
        log_warn "Agent test response may not contain expected events"
        log_info "Response preview: ${test_response:0:200}..."
    fi

    # Export for .env update
    export AGENT_ID
    export MODEL_ID
    export MCP_CONNECTOR_ID
}

# ============================================================================
# UPDATE .ENV FILE
# ============================================================================

update_env_file() {
    log_step "6" "Updating .env file"

    cd "$PROJECT_ROOT"

    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            log_info "Creating .env from .env.example..."
            cp .env.example .env
        else
            log_error ".env file not found and no .env.example available"
            exit 1
        fi
    fi

    # Backup existing .env
    local backup_file=".env.backup.$(date +%Y%m%d_%H%M%S)"
    cp .env "$backup_file"
    log_info "Backed up .env to $backup_file"

    # Update MLCOMMONS_ENDPOINT
    if grep -q "^MLCOMMONS_ENDPOINT=" .env; then
        sed -i '' "s|^MLCOMMONS_ENDPOINT=.*|MLCOMMONS_ENDPOINT=http://localhost:$MLCOMMONS_PORT/_plugins/_ml/agents/$AGENT_ID/_execute/stream|" .env
    else
        echo "MLCOMMONS_ENDPOINT=http://localhost:$MLCOMMONS_PORT/_plugins/_ml/agents/$AGENT_ID/_execute/stream" >> .env
    fi

    # Update AWS credentials (same creds used for Bedrock connector)
    if grep -q "^AWS_ACCESS_KEY_ID=" .env; then
        sed -i '' "s|^AWS_ACCESS_KEY_ID=.*|AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID|" .env
    else
        echo "AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID" >> .env
    fi

    if grep -q "^AWS_SECRET_ACCESS_KEY=" .env; then
        sed -i '' "s|^AWS_SECRET_ACCESS_KEY=.*|AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY|" .env
    else
        echo "AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY" >> .env
    fi

    if grep -q "^AWS_SESSION_TOKEN=" .env; then
        sed -i '' "s|^AWS_SESSION_TOKEN=.*|AWS_SESSION_TOKEN=$AWS_SESSION_TOKEN|" .env
    else
        echo "AWS_SESSION_TOKEN=$AWS_SESSION_TOKEN" >> .env
    fi

    if grep -q "^AWS_REGION=" .env; then
        sed -i '' "s|^AWS_REGION=.*|AWS_REGION=$AWS_REGION|" .env
    else
        echo "AWS_REGION=$AWS_REGION" >> .env
    fi

    # Add setup comment at top of file
    local temp_file=$(mktemp)
    echo "# Auto-configured by setup.sh on $(date)" > "$temp_file"
    echo "# Agent ID: $AGENT_ID" >> "$temp_file"
    echo "# Model ID: $MODEL_ID" >> "$temp_file"
    echo "" >> "$temp_file"
    cat .env >> "$temp_file"
    mv "$temp_file" .env

    log_success ".env file updated with agent configuration and AWS credentials"
}

# ============================================================================
# LOG INGESTION SERVER
# ============================================================================

start_log_ingestion_server() {
    log_step "7" "Log Ingestion Server"

    # Log ingestion runs from ml-commons repo
    # Branch: jpz-goyamegh from https://github.com/jiapingzeng/ml-commons
    if [ -d "$WORKSPACE_DIR/ml-commons" ]; then
        log_info "Starting log ingestion from ml-commons..."
        cd "$WORKSPACE_DIR/ml-commons"

        # Ensure we're on the correct branch
        git fetch origin jpz-goyamegh 2>/dev/null || true
        git checkout jpz-goyamegh 2>/dev/null || log_warn "Could not switch to jpz-goyamegh branch"

        ./gradlew ingestLogs &
        local ingest_pid=$!
        log_success "Log ingestion server started (PID: $ingest_pid)"

        cd "$PROJECT_ROOT"
    else
        log_warn "ml-commons directory not found at $WORKSPACE_DIR/ml-commons"
        log_info "Log ingestion requires --setup-opensearch first, or manual ml-commons clone"
    fi
}

# ============================================================================
# START AGENTEVAL SERVICES
# ============================================================================

start_agenteval_services() {
    log_step "8" "Starting AgentEval Services"

    cd "$PROJECT_ROOT"

    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        log_info "Installing dependencies..."
        npm install
    fi

    # Create logs directory
    mkdir -p "$PROJECT_ROOT/logs"

    log_info "Building UI and starting unified server on port $SERVER_PORT..."
    log_info "Server logs will appear below. Press Ctrl+C to stop."
    echo ""
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}  Open http://localhost:$SERVER_PORT in browser${NC}"
    echo -e "${GREEN}================================================${NC}"
    echo ""

    # Start unified server (builds UI + serves everything from one port)
    # Runs in FOREGROUND so logs are visible
    npm run server
}

# ============================================================================
# MAIN
# ============================================================================

main() {
    echo -e "\n${GREEN}================================================${NC}"
    echo -e "${GREEN}      AgentEval Setup Script${NC}"
    echo -e "${GREEN}================================================${NC}\n"

    # Handle command line arguments
    case "${1:-}" in
        --stop)
            stop_services
            exit 0
            ;;
        --status)
            show_status
            exit 0
            ;;
        --setup-opensearch)
            # Full OpenSearch/ML-Commons setup
            log_info "Full OpenSearch/ML-Commons setup mode..."
            cleanup_ports

            check_prerequisites
            setup_opensearch_core
            setup_mlcommons
            start_mcp_server
            configure_mlcommons
            update_env_file
            start_log_ingestion_server
            start_agenteval_services
            ;;
        "")
            # Default: Quick start mode
            # Assumes ML-Commons and MCP Server are already running
            log_info "Quick start mode (assumes ML-Commons already running)..."
            log_info "Use --setup-opensearch for full setup"
            echo ""

            cleanup_ports

            # Check if ML-Commons is running
            if ! curl -s "http://localhost:$MLCOMMONS_PORT" > /dev/null 2>&1; then
                log_error "ML-Commons not running on port $MLCOMMONS_PORT"
                log_info "Run './scripts/setup.sh --setup-opensearch' for full setup first"
                exit 1
            fi
            log_success "ML-Commons is running"

            # Check if MCP Server is running
            if ! curl -s "http://localhost:$MCP_SERVER_PORT/mcp/" > /dev/null 2>&1; then
                log_warn "MCP Server not detected on port $MCP_SERVER_PORT - starting it..."
                start_mcp_server
            else
                log_success "MCP Server is running"
            fi

            # Core quick start flow
            configure_mlcommons
            update_env_file
            start_log_ingestion_server
            start_agenteval_services
            ;;
        *)
            echo "Usage: $0 [--setup-opensearch|--stop|--status]"
            echo ""
            echo "Commands:"
            echo "  (default)          Quick start: fetch creds, register new agent, start servers"
            echo "  --setup-opensearch Full setup: clone + build OpenSearch/ML-Commons"
            echo "  --stop             Stop all running services"
            echo "  --status           Check which services are running"
            exit 1
            ;;
    esac
    # Note: Summary is printed before frontend starts (in start_agenteval_services)
    # since frontend runs in foreground for live logs
}

main "$@"
