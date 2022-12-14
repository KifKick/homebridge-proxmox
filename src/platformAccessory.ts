import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge'
import os from 'node:os'

import { HomebridgeProxmoxPlatform } from './platform'

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class ProxmoxPlatformAccessory {
	private service: Service

	/**
	 * These are just used to create a working example
	 * You should implement your own code to track the state of your accessory
	 */
	private state = false

	constructor(
		private readonly platform: HomebridgeProxmoxPlatform,
		private readonly accessory: PlatformAccessory,
	) {

		// set accessory information
		this.accessory.getService(this.platform.Service.AccessoryInformation)!
			.setCharacteristic(this.platform.Characteristic.Manufacturer, os.hostname())
			.setCharacteristic(this.platform.Characteristic.Model, os.platform())
			.setCharacteristic(this.platform.Characteristic.SerialNumber, os.release())

		// get the Switch service if it exists, otherwise create a new Switch service
		// you can create multiple services for each accessory
		this.service = this.accessory.getService(this.platform.Service.Switch) || this.accessory.addService(this.platform.Service.Switch)

		// set the service name, this is what is displayed as the default name on the Home app
		// in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
		this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.vmName)

		// each service must implement at-minimum the "required characteristics" for the given service type
		// see https://developers.homebridge.io/#/service/Switch

		// register handlers for the On/Off Characteristic
		this.service.getCharacteristic(this.platform.Characteristic.On)
			.onSet(this.setOn.bind(this))                // SET - bind to the `setOn` method below
			.onGet(this.getOn.bind(this))               // GET - bind to the `getOn` method below

		/* setInterval(() => {
			this.fetchState()
		}, 10 * 1000) */
	}

	/**
	 * Handle "SET" requests from HomeKit
	 * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
	 */
	async setOn(value: CharacteristicValue) {
		const bool = value as boolean
		if (this.platform.config.debug) this.platform.log.debug(`${this.accessory.displayName} setOn: ${bool}`)
		this.switchState(bool).catch(() => {
			throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE)
		})
		throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE)
	}

	private async switchState(state: boolean) {
		const context: {
			vmId: number; vmName: string; nodeName: string;
		} = this.accessory.context.device
		let switched = false

		for (const node of this.platform.nodes) {
			const theNode = this.platform.proxmox.nodes.$(node.node)
			// list Qemu VMS
			const qemus = await theNode.qemu.$get({ full: true })

			// iterate Qemu VMS
			for (const qemu of qemus) {
				// do some suff.
				if (qemu.vmid === context.vmId && node.node === context.nodeName) {
					if (state) {
						await theNode.qemu.$(qemu.vmid).status.start.$post()
					} else {
						await theNode.qemu.$(qemu.vmid).status.stop.$post()
					}
					switched = true
					break
				}
			}

			const lxcs = await theNode.lxc.$get()
			for (const lxc of lxcs) {
				if (lxc.vmid === context.vmId && node.node === context.nodeName) {
					if (state) {
						await theNode.lxc.$(lxc.vmid).status.start.$post()
					} else {
						await theNode.lxc.$(lxc.vmid).status.stop.$post()
					}
					switched = true
					break
				}
			}
		}

		if (switched) {
			this.state = state
			this.service.updateCharacteristic(this.platform.Characteristic.On, state)
			if (this.platform.config.debug) this.platform.log.debug(`switchState success and current state is: ${state}`)
		}
	}

	/**
	 * Handle the "GET" requests from HomeKit
	 * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
	 *
	 * GET requests should return as fast as possbile. A long delay here will result in
	 * HomeKit being unresponsive and a bad user experience in general.
	 *
	 * If your device takes time to respond you should update the status of your device
	 * asynchronously instead using the `updateCharacteristic` method instead.

	 * @example
	 * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
	 */
	getOn(): CharacteristicValue {
		// if you need to return an error to show the device as "Not Responding" in the Home app:
		// throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE)
		if (this.platform.config.debug) this.platform.log.debug(`${this.accessory.displayName} getOn`)
		this.fetchState().catch(() => {
			throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE)
		})
		return this.state
	}

	/**
	 * Return state async and set it
	 */
	private async fetchState() {
		let isOn = false

		const context: {
			vmId: number; vmName: string; nodeName: string;
		} = this.accessory.context.device

		for (const node of this.platform.nodes) {
			const theNode = this.platform.proxmox.nodes.$(node.node)
			// list Qemu VMS
			const qemus = await theNode.qemu.$get({ full: true })

			// iterate Qemu VMS
			for (const qemu of qemus) {
				// do some suff.
				if (qemu.vmid === context.vmId && node.node === context.nodeName) {
					const response = await theNode.qemu.$(qemu.vmid).status.current.$get()
					if (response.status === 'stopped') {
						isOn = false
					} else {
						isOn = true
					}
					break
				}
			}

			const lxcs = await theNode.lxc.$get()
			for (const lxc of lxcs) {
				if (lxc.vmid === context.vmId && node.node === context.nodeName) {
					const response = await theNode.lxc.$(lxc.vmid).status.current.$get()
					if (response.status === 'stopped') {
						isOn = false
					} else {
						isOn = true
					}
					break
				}
			}
		}

		if (this.platform.config.debug) this.platform.log.debug(`${this.accessory.displayName} fetchState: ${isOn}`)
		this.state = isOn
		this.service.updateCharacteristic(this.platform.Characteristic.On, isOn)
		return isOn
	}
}
