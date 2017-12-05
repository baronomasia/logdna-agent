const {Docker} = require('node-docker-api');
const log = require('./log');

const LABEL_BLACKLIST = ['controller-revision-hash', 'image', 'integration-test', 'name', 'pod-template-generation', 'pod-template-hash'];
const SANDBOX_NAME_KEY = 'io.kubernetes.sandbox.id';

var containerIdToNetworkId = {};
var networkIdToLabels = {};

var storeLabels = function(id, labels) {
    // Pick up actual container id from pod sandbox and map to networkid
    if (labels[SANDBOX_NAME_KEY]) {
        var networkId = labels[SANDBOX_NAME_KEY];
        containerIdToNetworkId[id] = networkId;
        if (labels.image) {
            var nidLabels = {};
            if (networkIdToLabels[networkId]) {
                nidLabels = networkIdToLabels[networkId];
            }
            // Always keep original labels - containers are immutable!
            if (!nidLabels.image) {
                var imageArray = labels.image.split(':');
                nidLabels.image = imageArray[imageArray.length-1];
            }
            networkIdToLabels[networkId] = nidLabels;
        }
        return;
    }
    // Map network id to labels object
    var importantLabels = {};
    if (networkIdToLabels[id]) {
        importantLabels = networkIdToLabels[id];
    }
    Object.keys(labels).forEach(function(key) {
        if (key.indexOf('.') === -1 && LABEL_BLACKLIST.indexOf(key) === -1) {
            // Always keep original labels - containers are immutable!
            if (!importantLabels[key]) {
                importantLabels[key] = labels[key];
            }
        }
    });
    if (Object.keys(labels).length > 0) {
        networkIdToLabels[id] = importantLabels;
    }
};

var processContainerEvent = function(event) {
    if (event.status === 'destroy') {
        // Delete labels of containers that have been destroyed
        delete containerIdToNetworkId[event.id];
        delete networkIdToLabels[event.id];
    } else if (event.status === 'create') {
        storeLabels(event.id, event.Actor.Attributes);
    }
};

exports.init = function() {
    const watchEvents = stream => new Promise((resolve, reject) => {
        stream.on('data', data => processContainerEvent(JSON.parse(data.toString())));
        stream.on('end', resolve);
        stream.on('error', reject);
    });
    // Grab initial set of containers on startup
    const docker = new Docker({ socketPath: '/var/run/docker.sock' });
    docker.container.list()
        .then(containers => containers.forEach(function(container) {
            if (container.id && container.data.Labels) {
                if (container.data.Image) {
                    container.data.Labels.image = container.data.Image;
                }
                storeLabels(container.id, container.data.Labels);
            }
        }))
        .catch(error => log(error));
    // Watch container events d to keep labels up to date
    docker.events({
        since: ((new Date().getTime() / 1000) - 60).toFixed(0)
        , type: 'container'
    })
        .then(stream => watchEvents(stream))
        .catch(error => log(error));
};

exports.getLabelsFromFile = function(filename) {
    var containerId = filename.substring(filename.lastIndexOf('-')+1, filename.length-4);
    return networkIdToLabels[containerIdToNetworkId[containerId]];
};
