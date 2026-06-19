-- Sliding Window Log Rate Limiter
-- KEYS[1] = sorted set key (e.g., "rate_limit:sliding_window:ip:192.168.1.1")
-- ARGV[1] = window size in milliseconds
-- ARGV[2] = max requests allowed in window
-- ARGV[3] = current timestamp in milliseconds
-- ARGV[4] = cost (usually 1)

-- Returns: {allowed: 0|1, remaining_in_window, retry_after_ms, window_end_timestamp}

local windowMs = tonumber(ARGV[1])
local maxRequests = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4] or 1)

local windowStart = now - windowMs

-- Remove expired entries outside the window
redis.call("ZREMRANGEBYSCORE", KEYS[1], 0, windowStart)

-- Count entries in current window
local currentCount = redis.call("ZCARD", KEYS[1])

-- Check if request will exceed the limit
local allowed = 0
local remaining = maxRequests - currentCount - cost

if remaining >= 0 then
    allowed = 1
    -- Add current request timestamp to the log
    redis.call("ZADD", KEYS[1], now, now .. ":" .. math.random())
    -- Set TTL to window size + 1 second cleanup buffer
    redis.call("EXPIRE", KEYS[1], math.ceil(windowMs / 1000) + 1)
else
    -- Get the oldest entry's timestamp to calculate retry-after
    local oldestEntries = redis.call("ZRANGE", KEYS[1], 0, 0, "WITHSCORES")
    local oldestTimestamp = tonumber(oldestEntries[2] or 0)
    -- Retry after is when the oldest entry expires from the window
    -- + time for cost number of slots to be available
    remaining = maxRequests - currentCount
end

-- Calculate when the window will fully reset
local resetTimestamp = math.floor((now + windowMs) / 1000)

-- Retry after: when will a slot be available?
local retryAfterMs = 0
if allowed == 0 then
    local entries = redis.call("ZRANGE", KEYS[1], 0, currentCount - maxRequests, "WITHSCORES")
    if #entries >= 1 then
        local oldestInWindow = tonumber(entries[2] or entries[#entries])
        if oldestInWindow then
            retryAfterMs = oldestInWindow + windowMs - now
        end
    end
    if retryAfterMs <= 0 then
        retryAfterMs = windowMs
    end
end

return {allowed, math.max(0, remaining), math.ceil(retryAfterMs / 1000), resetTimestamp}
