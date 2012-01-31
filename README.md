**redis-pubsub** provides a simple interface to a single pub/sub channel on a
Redis server. [![Build Status](https://secure.travis-ci.org/AngryBytes/redis-pubsub.png)](http://travis-ci.org/AngryBytes/redis-pubsub)

    var pubsub = require('redis-pubsub');

    // Subscribe to channel 'foobar' on a local server.
    var channel = pubsub.createChannel(6379, 'localhost', 'foobar');
    channel.on('ready', function() {
        channel.on('message', function(msg) {
            console.log(msg.greeting);
            channel.end();
        });
        channel.send({ greeting: 'Hello world!' });
    });

Waiting for the `ready` event is optional. The converse is the `close` event.

Messages are serialized to JSON by default, so you can send regular objects
across the wire. If this is undesirable, set the `raw` property:

    var channel = pubsub.createChannel(...);
    channel.raw = true;

---

There are two alternate ways to create a channel:

 * Using an existing RedisClient as the publisher. This will 'clone' the
   connection for the subscriber, using the same host, port and options.

        var client = redis.createClient(...);
        var channel = pubsub.createChannel(client, channel);

 * Explicitely specify both publisher and subscriber clients. This allows
   for sharing subscribers, or master-slave setups.

        var publisher = redis.createClient(...);
        var subscriber = redis.createClient(...);
        var channel = pubsub.createChannel(publisher, subscriber, channel);

In either case, provided RedisClient instances will never be closed on `end()`.
Instances created by redis-pubsub itself will be, and will also have their
`error` events re-emitted on the channel object.
