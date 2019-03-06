module.exports = function(Model, options) {

    var cachExpire = 0; // set default to 5 minutes

    if(options.expiryInSecs){ // set from config
      cachExpire = options.expiryInSecs;
    }

    if(options.client){
        var clientSettings = options.client;
    }else{
        var app = require('../../server/server.js');
        var clientSettings = app.get('redis');
    }

    var redis = require("redis"),
        client = redis.createClient(clientSettings);

    var redisDeletePattern = require('redis-delete-pattern');

    client.on("error", function (err) {
        console.log(err);
        // try to connect again with server config
        if(err.toString().indexOf("invalid password") !== -1){
            console.log("Invalid password... reconnecting with server config...");
            var app = require('../../server/server');
            var clientSettings = app.get('redis');
            client = redis.createClient(clientSettings);
        }
    });


    Model.beforeRemote('**', function(ctx, res, next) {
        // get all find methods and search first in cache
        if((ctx.method.name.indexOf("find") !== -1 || ctx.method.name.indexOf("__get") !== -1) && client.connected){
            if(cachExpire>0){
                var modelName = ctx.method.sharedClass.name;
                if (ctx.req.query.cache) {
                  cachExpire = ctx.req.query.cache;
                }

                // set key name
                var cache_key = modelName+'_'+new Buffer(JSON.stringify(ctx.req.query)).toString('base64');

                // search for cache
                client.get(cache_key, function(err, val) {
                    if(err){
                        console.log(err);
                    }

                    if(val !== null){
                        ctx.result = JSON.parse(val);
                        ctx.done(function(err) {
                            if (err) return next(err);
                        });
                    }else{
                        //return data
                        next();
                    }
                });

            }else{
                next();
            }
        }else{
            next();
        }
    });

    Model.afterRemote('**', function(ctx, res, next) {
        // get all find methods and search first in cache - if not exist save in cache
        if((ctx.method.name.indexOf("find") !== -1 || ctx.method.name.indexOf("__get") !== -1) && client.connected){
            if(cachExpire>0){
                var modelName = ctx.method.sharedClass.name;
                if (ctx.req.query.cache) {
                  cachExpire = ctx.req.query.cache;
                }

                // set key name
                var cache_key = modelName+'_'+new Buffer(JSON.stringify(ctx.req.query)).toString('base64');
                // search for cache
                client.get(cache_key, function(err, val) {
                    if(err){
                        console.log(err);
                    }

                    if(val == null){
                        // set cache key
                        client.set(cache_key, JSON.stringify(res));
                        client.expire(cache_key, cachExpire);
                        next();
                    }else{
                        next();
                    }
                });

            }else{
                next();
            }
        }else{
            next();
        }
    });

    Model.afterRemote('**', function(ctx, res, next) {
        // delete cache on patchOrCreate, create, delete, update, destroy, upsert
        if((ctx.method.name.indexOf("find") == -1 && ctx.method.name.indexOf("__get") == -1) && client.connected){
            var modelName = ctx.method.sharedClass.name;
            if (ctx.req.query.cache) {
              cachExpire = ctx.req.query.cache;
            }

            // set key name
            var cache_key = modelName+'_*';

            // delete cache
            redisDeletePattern({
                redis: client,
                pattern: cache_key
            }, function handleError (err) {
                if(err){
                    console.log(err);
                }
                next();
            });

        }else{
            next();
        }
    });
}
