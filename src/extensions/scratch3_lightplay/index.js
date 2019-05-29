const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const log = require('../../util/log');
const formatMessage = require('format-message');
const BLE = require('../../io/ble');
const Base64Util = require('../../util/base64-util');


/**
 * LightPlay BLE UUIDs
 * @enum
 */
const LightPlayBLE = {
    SERVICE:'6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    RX_CHARACTERISTIC:'6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    TX_CHARACTERISTIC:'6e400003-b5a3-f393-e0a9-e50e24dcca9e'
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
    MAGENTA: 'magenta'
};
    

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
         * The Bluetooth connection socket for reading/writing peripheral data.
         * @type {BLE}
         * @private
         */
        this._ble = null;
        this._runtime.registerPeripheralExtension(extensionId, this);

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
    send (message) {
        if (!this.isConnected()) return Promise.resolve();

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
        log('onConnect')
        this._ble.startNotifications(
            LightPlayBLE.SERVICE,
            LightPlayBLE.TX_CHARACTERISTIC,
            this._onMessage
        );
    }

    /**
     * Process the sensor data from the incoming BLE characteristic.
     * @param {object} data - the incoming BLE data.
     * @private
     */
    _onMessage (data) {
        //log('onMessage: '+data);
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
                    opcode: 'lightOn',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'lightplay.lightOn',
                        default: 'turn [LIGHT_ID] on',
                        description: 'turn a light on'
                    }),
                    arguments: {
                        LIGHT_ID: {
                            type: ArgumentType.STRING,
                            menu: 'LIGHT_ID',
                            defaultValue: LightPort.ALL
                        }
                    }
                },
                {
                    opcode: 'lightOff',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'lightplay.lightOff',
                        default: 'turn [LIGHT_ID] off',
                        description: 'turn a light off'
                    }),
                    arguments: {
                        LIGHT_ID: {
                            type: ArgumentType.STRING,
                            menu: 'LIGHT_ID',
                            defaultValue: LightPort.ALL
                        }
                    }
                },
                {
                    opcode: 'setLightColor',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'lightplay.setLightColor',
                        default: 'set [LIGHT_ID] color to [COLOR_ID]',
                        description: 'set a light color'
                    }),
                    arguments: {
                        LIGHT_ID: {
                            type: ArgumentType.STRING,
                            menu: 'LIGHT_ID',
                            defaultValue: LightPort.ALL
                        },
                        COLOR_ID: {
                            type: ArgumentType.STRING,
                            menu: 'COLOR_ID',
                            defaultValue: LightColor.WHITE
                        }
                    }
                },    
            ],
            menus: {
                LIGHT_ID: [
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
                ],
            }
        };
    }

    lightOn (args) {

        var port = this._getPortByte(args);
        var message = new Uint8Array([port, 0, 0, 0, 0, 0, 0, 15, 255]);
        return this._peripheral.send(message);
    }

    lightOff (args) {

        var port = this._getPortByte(args);
        var message = new Uint8Array([port, 0, 0, 0, 0, 0, 0, 0, 0]);
        return this._peripheral.send(message);
    }

    setLightColor (args) {

        var port = this._getPortByte(args);
        var color = this._getColorBytes(args);
        var message = new Uint8Array(9);
        message[0] = port;
        message.set(color, 1);
        return this._peripheral.send(message);
    }


    _getPortByte (args) {
        
        var port = 0;

        if(args.LIGHT_ID == LightPort.ONE){
            port = 72;
        } else if (args.LIGHT_ID == LightPort.TWO) {
            port = 80;
        } else if (args.LIGHT_ID == LightPort.THREE) {
            port = 88;
        } else if (args.LIGHT_ID == LightPort.ALL) {
            port = 64;
        }
        return port;
    }

    _getColorBytes (args) {

        switch (args.COLOR_ID) {
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
