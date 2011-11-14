var spawn  = require('child_process').spawn;
var tap    = require('tap');
var redis  = require('redis');
var pubsub = require('./');


// The options used to spawn redis and create connections.
var options = {
    daemonize: 'no',
    databases: 1,
    bind: '127.0.0.1',
    port: 22222
};

// Spawn a redis.
function spawnRedis(callback) {
    var child = spawn('redis-server', ['-']);
    child.stderr.pipe(process.stderr);

    var exitHandler, stdoutHandler;

    child.on('exit', exitHandler = function(code) {
        callback(new Error("Child exited with code " + code), null);
    });

    var data = '';
    child.stdout.setEncoding('utf-8');
    child.stdout.on('data', stdoutHandler = function(chunk) {
        data += chunk;
        if (/ready to accept/.test(data)) {
            child.removeListener('exit', exitHandler);
            child.stdout.removeListener('data', stdoutHandler);
            callback(null, child);
        }
    });

    for (var key in options)
        child.stdin.write(key + ' ' + String(options[key]) + '\n');
    child.stdin.end();
}

// A test case using a redis server.
function test(name, callback) {
    tap.test(name, function(t) {
        spawnRedis(function(err, child) {
            if (err) throw err

            var origEnd = t.end.bind(t);
            t.end = function() {
                child.on('exit', function() {
                    origEnd();
                });
                child.kill();
            };

            callback(t);
        });
    });
}

// A test case using a redis server and RedisClient.
function test_with_client(name, callback) {
    test(name, function(t) {
        var client = redis.createClient(options.port, options.bind);

        var origEnd = t.end.bind(t);
        t.end = function() {
            client.end();
            origEnd();
        };

        client.once('ready', function() {
            callback(t, client);
        });
    });
}


// Test cases follow.

test('open a channel', function(t) {
    var channel;

    channel = pubsub.createChannel(options.port, options.bind, 'foo');
    t.pass('open a channel');

    channel.end();
    t.pass('rapidly close a channel');

    channel = pubsub.createChannel(options.port, options.bind, 'foo');
    channel.on('ready', function() {
        t.pass('open a channel and wait for \'ready\'');

        channel.end();
        t.pass('close a channel');

        t.end();
    });
});

test_with_client('open a channel using a client', function(t, client) {
    var pub = client;
    var sub = redis.createClient(pub.port, pub.host, pub.options);
    var channel;

    channel = pubsub.createChannel(pub, 'foo');
    t.pass('open a channel using the client');

    channel.end();
    t.pass('close a channel');

    channel = pubsub.createChannel(pub, sub, 'foo');
    t.pass('open a channel using two clients');

    channel.end();
    t.pass('close a channel');

    sub.end();
    t.end();
});

test_with_client('publish messages', function(t, pub) {
    t.plan(2);

    var channel1 = pubsub.createChannel(pub, 'foo');
    var channel2 = pubsub.createChannel(pub, 'foo');

    channel2.on('ready', function() {
        channel2.on('message', function(m) {
            channel1.end();
            channel2.end();
            t.equal(m.x, 'bla', 'receive the message');
        });
        channel1.send({ x: 'bla' }, function() {
            t.pass('send a message');
        });
    });
});

test_with_client('publish raw messages', function(t, pub) {
    t.plan(2);

    var channel1 = pubsub.createChannel(pub, 'foo');
    var channel2 = pubsub.createChannel(pub, 'foo');
    channel1.raw = channel2.raw = true;

    channel2.on('ready', function() {
        channel2.on('message', function(m) {
            channel1.end();
            channel2.end();
            t.equal(m, 'bla', 'receive the message');
        });
        channel1.send('bla', function() {
            t.pass('send a message');
        });
    });
});
