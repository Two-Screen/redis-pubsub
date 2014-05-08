var spawn  = require('child_process').spawn;
var tap    = require('tap');
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
            if (err) throw err;

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


// Test cases follow.

test('open a channel', function(t) {
    var channel;

    channel = pubsub.createChannel(options.port, options.bind, 'foo');
    t.pass('open a channel');

    channel.destroy();
    t.pass('rapidly close a channel');

    channel = pubsub.createChannel(options.port, options.bind, 'foo');
    channel.on('connect', function() {
        t.pass('open a channel and wait for \'connect\'');

        channel.destroy();
        t.pass('close a channel');

        t.end();
    });
});

test('publish messages', function(t, pub) {
    t.plan(2);

    var channel1 = pubsub.createChannel(options.port, options.bind, 'foo');
    var channel2 = pubsub.createChannel(options.port, options.bind, 'foo');

    channel2.on('connect', function() {
        channel2.on('message', function(m) {
            channel1.destroy();
            channel2.destroy();
            t.equal(m.x, 'bla', 'receive the message');
        });
        channel1.send({ x: 'bla' });
        t.pass('send a message');
    });
});

test('publish raw messages', function(t, pub) {
    t.plan(2);

    var channel1 = pubsub.createChannel(options.port, options.bind, 'foo');
    var channel2 = pubsub.createChannel(options.port, options.bind, 'foo');
    channel1.raw = channel2.raw = true;

    channel2.on('connect', function() {
        channel2.on('message', function(m) {
            channel1.destroy();
            channel2.destroy();
            t.equal(m, 'bla', 'receive the message');
        });
        channel1.send('bla');
        t.pass('send a message');
    });
});
