const NodeCache = require('node-cache');

// Create cache instances with different TTL
const shortCache = new NodeCache({ stdTTL: 60 }); // 1 minute
const mediumCache = new NodeCache({ stdTTL: 300 }); // 5 minutes
const longCache = new NodeCache({ stdTTL: 1800 }); // 30 minutes

const cacheMiddleware = (duration = 'medium') => {
  return (req, res, next) => {
    const cache = duration === 'short' ? shortCache : 
                  duration === 'long' ? longCache : mediumCache;
    
    const key = req.originalUrl || req.url;
    const cached = cache.get(key);
    
    if (cached) {
      return res.json(cached);
    }
    
    res.sendResponse = res.json;
    res.json = (body) => {
      cache.set(key, body);
      res.sendResponse(body);
    };
    
    next();
  };
};

const clearCache = (pattern) => {
  [shortCache, mediumCache, longCache].forEach(cache => {
    const keys = cache.keys();
    keys.forEach(key => {
      if (key.includes(pattern)) {
        cache.del(key);
      }
    });
  });
};

module.exports = { cacheMiddleware, clearCache };