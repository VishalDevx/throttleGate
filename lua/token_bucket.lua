-- Token Bucket Rate Limiter
-- KEYS[1] = bucket key (e.g., "rate_limit:token_bucket:ip:192.168.1.1")
-- ARGV[1] = bucket capacity (max tokens)
-- ARGV[2] = refill rate (tokens per second)
-- ARGV[3] = current timestamp in seconds
-- ARGV[4] = cost (tokens to consume, default 1)

-- Returns: {allowed: 0|1, remaining_tokens, retry_after_seconds, reset_timestamp}

local capacity = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4] or 1)

-- Get current bucket state
local bucketData = redis.call("HMGET", KEYS[1], "tokens", "lastRefillTime")
local tokens = tonumber(bucketData[1] or capacity)
local lastRefillTime = tonumber(bucketData[2] or now)

-- Calculate tokens to add since last refill
local elapsed = math.max(0, now - lastRefillTime)
local tokensToAdd = elapsed * refillRate

-- Refill bucket (cap at capacity)
tokens = math.min(capacity, tokens + tokensToAdd)

-- Update last refill time
local lastRefillTime = now

-- Determine if request is allowed
local allowed = 0
if tokens >= cost then
    tokens = tokens - cost
    allowed = 1
end

-- Calculate remaining tokens and retry-after
local remainingTokens = math.floor(tokens * 1000) / 1000  -- 3 decimal places

local retryAfter = 0
if allowed == 0 then
    -- Time until enough tokens are available
    if refillRate > 0 then
        retryAfter = math.ceil((cost - tokens) / refillRate * 1000) / 1000
    else
        retryAfter = -1  -- never (no refill)
    end
end

-- Calculate when the bucket will be full (for X-RateLimit-Reset)
local timeToFull = math.ceil((capacity - tokens) / refillRate * 1000) / 1000
local resetTimestamp = math.floor(now + timeToFull)

-- Store updated state with TTL (5x the time to fully drain at max refill)
local ttl = math.max(60, math.ceil((capacity / math.max(refillRate, 0.001)) * 5))
redis.call("HMSET", KEYS[1], "tokens", tokens, "lastRefillTime", lastRefillTime)
redis.call("EXPIRE", KEYS[1], ttl)

return {allowed, remainingTokens, retryAfter, resetTimestamp}
