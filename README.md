**redis-pubsub** provides a simple interface to a single pub/sub channel on a
Redis server. [![Build Status](https://secure.travis-ci.org/Two-Screen/redis-pubsub.png)](http://travis-ci.org/Two-Screen/redis-pubsub)

    var pubsub = require('redis-pubsub');

    // Subscribe to channel 'foobar' on a local server.
    var channel = pubsub.createChannel(6379, 'localhost', 'foobar');
    channel.on('connect', function() {
        channel.on('message', function(msg) {
            console.log(msg.greeting);
            channel.end();
        });
        channel.send({ greeting: 'Hello world!' });
    });

Other events are `error` and `close`.

Messages are serialized to JSON by default, so you can send regular objects
across the wire. If this is undesirable, set the `raw` property:

    var channel = pubsub.createChannel(...);
    channel.raw = true;
