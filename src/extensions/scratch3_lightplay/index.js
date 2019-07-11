const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const log = require('../../util/log');
const formatMessage = require('format-message');
const BLE = require('../../io/ble');
const Base64Util = require('../../util/base64-util');
const RateLimiter = require('../../util/rateLimiter.js');


/**
 * LightPlay BLE UUIDs
 * @enum
 */
const LightPlayBLE = {
    SERVICE:'6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    RX_CHARACTERISTIC:'6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    TX_CHARACTERISTIC:'6e400003-b5a3-f393-e0a9-e50e24dcca9e', 
    sendInterval: 300,
    sendRateMax: 20
};

/**
 * Enum for light specification.
 * @readonly
 * @enum {string}
 */
const LightPort = {
    ONE: 'light 1',
    TWO: 'light 2', 
    THREE: 'light 3',
    ALL: 'all lights'
};

/**
 * Enum for light state.
 * @readonly
 * @enum {string}
 */
const LightStatus = {
    ON: 'on',
    OFF: 'off',
    FADING: 'fading'
};

/**
 * Enum for light colors.
 * @readonly
 * @enum {string}
 */
const LightColor = {
    WHITE: 'white',
    RED: 'red',
    ORANGE: 'orange',
    YELLOW: 'yellow',
    GREEN: 'green',
    BLUE: 'blue',
    MAGENTA: 'magenta',
    SURPRISE: 'surprise'
};    


/**
 * Manage status for LightPlay Light.
 */
class Light {
    /**
     * Construct a Light instance.
     * @param {int} port - the [1,2,3] port number of this light
     */
    constructor () {
        /**
         * The port number of this light on its parent peripheral.
         * @type {int}
         * @private
         */
        //this._port = port;
        /**
         * The state of this light (on/off/fading)
         * @type {string}
         */
        this.status = LightStatus.OFF;
        /**
         * The color of this light
         * @type {string}
         */
        this.color = LightColor.WHITE;
    }
}

/**
 * Manage communication with a LightPlay peripheral over a Bluetooth Low Energy client socket.
 */
class LightPlay {

    constructor (runtime, extensionId) {

        /**
         * The Scratch 3.0 runtime used to trigger the green flag button.
         * @type {Runtime}
         * @private
         */
        this._runtime = runtime;

        /**
         * The id of the extension this peripheral belongs to.
         */
        this._extensionId = extensionId;

        /**
         * The most recent state for each light.
         */
        this._lights = [];
        this._lights[LightPort.ONE] = new Light();
        this._lights[LightPort.TWO] = new Light();
        this._lights[LightPort.THREE] = new Light();

        /**
         * The Bluetooth connection socket for reading/writing peripheral data.
         * @type {BLE}
         * @private
         */
        this._ble = null;
        this._runtime.registerPeripheralExtension(extensionId, this);

        /**
         * A rate limiter utility, to help limit the rate at which we send BLE messages
         * over the socket to Scratch Link to a maximum number of sends per second.
         * @type {RateLimiter}
         * @private
         */
        this._rateLimiter = new RateLimiter(LightPlayBLE.sendRateMax);

        this.disconnect = this.disconnect.bind(this);
        this._onConnect = this._onConnect.bind(this);
        this._onMessage = this._onMessage.bind(this);
    }
   

    /**
     * Called by the runtime when user wants to scan for a LightPlay peripheral.
     */
    scan () {
        log('scan start');
        if (this._ble) {
            this._ble.disconnect();
        }
        this._ble = new BLE(this._runtime, this._extensionId, {
            filters: [{
                services: [LightPlayBLE.SERVICE]
            }],
            optionalServices: []
        }, this._onConnect, this.disconnect);
    }

    /**
     * Called by the runtime when user wants to connect to a certain LightPlay peripheral.
     * @param {number} id - the id of the peripheral to connect to.
     */
    connect (id) {
        log('connect');
        if (this._ble) {
            this._ble.connectPeripheral(id);
        }
    }

    /**
     * Disconnects from the current BLE socket.
     */
    disconnect () {
        if (this._ble) {
            this._ble.disconnect();
        }
    }

    /**
     * Called by the runtime to detect whether the Boost peripheral is connected.
     * @return {boolean} - the connected state.
     */
    isConnected () {
        let connected = false;
        if (this._ble) {
            connected = this._ble.isConnected();
        }
        return connected;
    }

    /**
     * Write a message to the LightPlay peripheral BLE socket.
     * @param {Array} message - the message to write.
     * @return {Promise} - a promise result of the write operation
     */
    send (message, useLimiter = true) {
        
        if (!this.isConnected()) return Promise.resolve();

        if (useLimiter) {
            if (!this._rateLimiter.okayToSend()) {
                log('send stopped');
                return Promise.resolve();
            }
        }
        log('sending');

        return this._ble.write(
            LightPlayBLE.SERVICE,
            LightPlayBLE.RX_CHARACTERISTIC,
            Base64Util.uint8ArrayToBase64(message),
            'base64',
            true
        );
    }

    
    /**
     * Starts reading data from peripheral after BLE has connected.
     * @private
     */
    _onConnect () {
        
        this._ble.startNotifications(
            LightPlayBLE.SERVICE,
            LightPlayBLE.TX_CHARACTERISTIC,
            this._onMessage
        );

        // reset lights
        this.send(new Uint8Array([64, 0, 0, 0, 0, 0, 0, 0, 0]));
        // set fade speed to 2 sec
        this.send(new Uint8Array([69, 2]));
    }

    /**
     * Process the sensor data from the incoming BLE characteristic.
     * @param {object} data - the incoming BLE data.
     * @private
     */
    _onMessage (data) {
        //log('onMessage: '+data);
    }


    /**
     * Update light status
     */

    setLightOff (port) {
        
        if (port == LightPort.ALL){
            this._lights[LightPort.ONE].status = LightStatus.OFF;
            this._lights[LightPort.TWO].status = LightStatus.OFF;
            this._lights[LightPort.THREE].status = LightStatus.OFF;
        } else {
            this._lights[port].status = LightStatus.OFF;
        }
    }

    getLightStatus (port) {
        
        if (port != LightPort.ALL){
            return this._lights[port].status;
        } else {
            if (this._lights[LightPort.ONE].status == this._lights[LightPort.TWO].status &&
                this._lights[LightPort.ONE].status == this._lights[LightPort.THREE].status){
                return this._lights[LightPort.ONE].status;
            } else {
                return false;
            }
        }
    }

    setLightColor (port, color) {
        
        if (port == LightPort.ALL){

            this._lights[LightPort.ONE].status = LightStatus.ON;
            this._lights[LightPort.TWO].status = LightStatus.ON;
            this._lights[LightPort.THREE].status = LightStatus.ON;

            this._lights[LightPort.ONE].color = color;
            this._lights[LightPort.TWO].color = color;
            this._lights[LightPort.THREE].color = color;

        } else {
            this._lights[port].status = LightStatus.ON;
            this._lights[port].color = color;
        }
    }

    getLightColor (port) {
        if (port != LightPort.ALL){
            return this._lights[port].color;
        } else {
            if (this._lights[LightPort.ONE].color == this._lights[LightPort.TWO].color &&
                this._lights[LightPort.ONE].color == this._lights[LightPort.THREE].color){
                return this._lights[LightPort.ONE].color;
            } else {
                return false;
            }
        }
    }
}



/**
 * Class for the translate block in Scratch 3.0.
 * @constructor
 */
class Scratch3LightplayBlocks {
    
    /**
     * @return {string} - the ID of this extension.
     */
    static get EXTENSION_ID () {
        return 'lightplay';
    }

    /**
     * @return {string} - the name of this extension.
     */
    static get EXTENSION_NAME () {
        return 'LightPlay';
    }

    /**
     * Construct a set of Lightplay blocks.
     * @param {Runtime} runtime - the Scratch 3.0 runtime.
     */
    constructor (runtime) {
        /**
         * The Scratch 3.0 runtime.
         * @type {Runtime}
         */
        this.runtime = runtime;

        // Create a new LightPlay peripheral instance
        this._peripheral = new LightPlay(this.runtime, Scratch3LightplayBlocks.EXTENSION_ID);
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        return {
            id: Scratch3LightplayBlocks.EXTENSION_ID,
            name: Scratch3LightplayBlocks.EXTENSION_NAME,
            blockIconURI: '',
            showStatusButton: true,
            blocks: [
                {
                    opcode: 'setLightColor',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'lightplay.setLightColor',
                        default: 'set [LIGHT_PORT] color to [COLOR_ID]',
                        description: 'set a light color'
                    }),
                    arguments: {
                        LIGHT_PORT: {
                            type: ArgumentType.STRING,
                            menu: 'LIGHT_PORT',
                            defaultValue: LightPort.ALL
                        },
                        COLOR_ID: {
                            type: ArgumentType.STRING,
                            menu: 'COLOR_ID',
                            defaultValue: LightColor.WHITE
                        }
                    }
                },    
                {
                    opcode: 'setLightOff',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'lightplay.lightOff',
                        default: 'turn [LIGHT_PORT] off',
                        description: 'turn a light off'
                    }),
                    arguments: {
                        LIGHT_PORT: {
                            type: ArgumentType.STRING,
                            menu: 'LIGHT_PORT',
                            defaultValue: LightPort.ALL
                        }
                    }
                },
                {
                    opcode: 'fadeToColor',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'lightplay.fadeToColor',
                        default: 'fade [LIGHT_PORT] color to [COLOR_ID]',
                        description: 'fade to a light color'
                    }),
                    arguments: {
                        LIGHT_PORT: {
                            type: ArgumentType.STRING,
                            menu: 'LIGHT_PORT',
                            defaultValue: LightPort.ALL
                        },
                        COLOR_ID: {
                            type: ArgumentType.STRING,
                            menu: 'COLOR_ID',
                            defaultValue: LightColor.WHITE
                        }
                    }
                },
                {
                    opcode: 'fadeOff',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'lightplay.fadeOff',
                        default: 'fade [LIGHT_PORT] off',
                        description: 'fade a light off'
                    }),
                    arguments: {
                        LIGHT_PORT: {
                            type: ArgumentType.STRING,
                            menu: 'LIGHT_PORT',
                            defaultValue: LightPort.ALL
                        }
                    }
                }, 
            ],
            menus: {
                LIGHT_PORT: [
                    {
                        text: formatMessage({
                            id: 'lightplay.lightId.one',
                            default: 'light 1',
                            description: 'label for light 1 element in light menu for Lightplay extension'
                        }),
                        value: LightPort.ONE
                    },
                    {
                        text: formatMessage({
                            id: 'lightplay.lightId.two',
                            default: 'light 2',
                            description: 'label for light 2 element in light menu for Lightplay extension'
                        }),
                        value: LightPort.TWO
                    },
                    {
                        text: formatMessage({
                            id: 'lightplay.lightId.three',
                            default: 'light 3',
                            description: 'label for light 3 element in light menu for Lightplay extension'
                        }),
                        value: LightPort.THREE
                    },
                    {
                        text: formatMessage({
                            id: 'lightplay.lightId.all',
                            default: 'all lights',
                            description: 'label for all lights element in light menu for Lightplay extension'
                        }),
                        value: LightPort.ALL
                    },
                ],
                COLOR_ID: [
                    {
                        text: formatMessage({
                            id: 'lightplay.lightColor.white',
                            default: 'white',
                            description: ''
                        }),
                        value: LightColor.WHITE
                    },
                    {
                        text: formatMessage({
                            id: 'lightplay.lightColor.red',
                            default: 'red',
                            description: ''
                        }),
                        value: LightColor.RED
                    },
                    {
                        text: formatMessage({
                            id: 'lightplay.lightColor.orange',
                            default: 'orange',
                            description: ''
                        }),
                        value: LightColor.ORANGE
                    },
                    {
                        text: formatMessage({
                            id: 'lightplay.lightColor.yellow',
                            default: 'yellow',
                            description: ''
                        }),
                        value: LightColor.YELLOW
                    },
                    {
                        text: formatMessage({
                            id: 'lightplay.lightColor.green',
                            default: 'green',
                            description: ''
                        }),
                        value: LightColor.GREEN
                    },
                    {
                        text: formatMessage({
                            id: 'lightplay.lightColor.blue',
                            default: 'blue',
                            description: ''
                        }),
                        value: LightColor.BLUE
                    },
                    {
                        text: formatMessage({
                            id: 'lightplay.lightColor.magenta',
                            default: 'magenta',
                            description: ''
                        }),
                        value: LightColor.MAGENTA
                    },
                    {
                        text: formatMessage({
                            id: 'lightplay.lightColor.surprise',
                            default: 'surprise',
                            description: ''
                        }),
                        value: LightColor.SURPRISE
                    },
                ],
            }
        };
    }

    setLightColor (args) {

        if (args.LIGHT_PORT == LightPort.ALL){
            if (this._peripheral.getLightStatus(LightPort.ALL) == LightStatus.ON &&
                this._peripheral.getLightColor(LightPort.ALL) == args.COLOR_ID) {
                return; // all lights are on and same color, nothing to do
            }
        }

        if (this._peripheral.getLightStatus(args.LIGHT_PORT) == LightStatus.ON && 
            this._peripheral.getLightColor(args.LIGHT_PORT) == args.COLOR_ID) 
            return; // single light is already on and same color, nothing to do

        var port = this._getPortByte(args);

        var color_id = args.COLOR_ID;
        if (color_id == LightColor.SURPRISE){
            var current_color = this._peripheral.getLightColor(args.LIGHT_PORT);
            do {
                var random = Math.floor(Math.random()*7);
                color_id = Object.values(LightColor)[random];
            } while (color_id == current_color);
        }
        var color_bytes = this._getColorBytes(color_id);
        

        var message = new Uint8Array(9);
        message[0] = port;
        message.set(color_bytes, 1);
        this._peripheral.send(message).then(this._peripheral.setLightColor(args.LIGHT_PORT, color_id));

        return new Promise(resolve => {
            window.setTimeout(() => {
                resolve();
            }, LightPlayBLE.sendInterval);
        });
    }

    setLightOff (args) {

        if (this._peripheral.getLightStatus(args.LIGHT_PORT) == LightStatus.OFF) return; // nothing to do

        var port = this._getPortByte(args);
        var message = new Uint8Array([port, 0, 0, 0, 0, 0, 0, 0, 0]);
        this._peripheral.send(message).then(this._peripheral.setLightOff(args.LIGHT_PORT));

        return new Promise(resolve => {
            window.setTimeout(() => {          
                resolve();
            }, LightPlayBLE.sendInterval);
        });
    }

    fadeToColor (args) {

        // not sure if needed for fading..
        if (args.LIGHT_PORT == LightPort.ALL){
            if (this._peripheral.getLightStatus(LightPort.ALL) == LightStatus.ON &&
                this._peripheral.getLightColor(LightPort.ALL) == args.COLOR_ID) {
                return; // all lights are on and same target color, nothing to do
            }
        }

        if (this._peripheral.getLightStatus(args.LIGHT_PORT) == LightStatus.ON && // check if status is fading?
            this._peripheral.getLightColor(args.LIGHT_PORT) == args.COLOR_ID) 
            return; // single light is already on and target color, nothing to do

        var port = this._getPortByte(args);
        
        var color_id = args.COLOR_ID;
        if (color_id == LightColor.SURPRISE){
            var current_color = this._peripheral.getLightColor(args.LIGHT_PORT);
            do {
                var random = Math.floor(Math.random()*7);
                color_id = Object.values(LightColor)[random];
            } while (color_id == current_color);
        }
        var color_bytes = this._getColorBytes(color_id);


        var message = new Uint8Array(9);
        message[0] = port + 2; // +2 sets the bytes for the fade command (I know it's a ugly hack)
        message.set(color_bytes, 1);
        this._peripheral.send(message).then(this._peripheral.setLightColor(args.LIGHT_PORT, color_id));

        return new Promise(resolve => {
            window.setTimeout(() => {
                resolve();
            }, LightPlayBLE.sendInterval);
        });
    }

    fadeOff (args) {

        if (this._peripheral.getLightStatus(args.LIGHT_PORT) == LightStatus.OFF) return; // nothing to do

        var port = this._getPortByte(args) + 3; // +3 specifies fade out
        var message = new Uint8Array([port, 0, 0, 0, 0, 0, 0, 0, 0]);
        this._peripheral.send(message).then(this._peripheral.setLightOff(args.LIGHT_PORT));

        return new Promise(resolve => {
            window.setTimeout(() => {          
                resolve();
            }, LightPlayBLE.sendInterval);
        });
    }

    _getPortByte (args) {
        
        var portByte = 0;

        if(args.LIGHT_PORT == LightPort.ONE){
            portByte = 72;
        } else if (args.LIGHT_PORT == LightPort.TWO) {
            portByte = 80;
        } else if (args.LIGHT_PORT == LightPort.THREE) {
            portByte = 88;
        } else if (args.LIGHT_PORT == LightPort.ALL) {
            portByte = 64;
        }
        return portByte;
    }

    _getColorBytes (color_id) {

        switch (color_id) {
            case LightColor.WHITE: return [0, 0 ,0, 0, 0, 0,15, 255];
            case LightColor.RED: return [15, 255, 0, 0 ,0, 0, 0, 0];
            case LightColor.ORANGE: return [10, 240, 4, 176 ,0, 0, 0, 0];
            case LightColor.YELLOW: return [8, 52, 7, 108 ,0, 0, 0, 0];
            case LightColor.GREEN: return [0, 0, 15, 255 ,0, 0, 0, 0];
            case LightColor.BLUE: return [0, 0, 0, 0, 15, 255 ,0, 0];
            case LightColor.MAGENTA: return [7, 208, 0, 0, 11, 184 ,0, 0];
        }
    }

}

module.exports = Scratch3LightplayBlocks;
