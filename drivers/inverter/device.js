"use strict";

const Homey = require('homey');
const util = require('./../../lib/daikin');

class DaikinDevice extends Homey.Device {

    // this method is called when the Device is inited
    onInit() {						
        
		this.log('name:', this.getName());
        this.log('class:', this.getClass());

		this.log('Capability registration started...');
        this.registerCapabilityListener('airco_mode', this.onCapabilityMode.bind(this));
		this.registerCapabilityListener('fan_rate', this.onCapabilityFanRate.bind(this));			
		this.registerCapabilityListener('fan_direction', this.onCapabilityFanDir.bind(this));	       
		this.registerCapabilityListener('airco_humidty', this.onCapabilityAircoHum.bind(this));
        this.registerCapabilityListener('airco_temperature', this.onCapabilityAircoTemp.bind(this));        
		this.registerCapabilityListener('measure_temperature.inside', this.onCapabilityMeasureTemperature.bind(this));
        this.registerCapabilityListener('measure_temperature.outside', this.onCapabilityMeasureTemperature.bind(this));       
                
		this.log('Registration of Capabilities and Report Listeners completed!');

    }
		
	onAdded() {
		this.log('device added');
		
		var deviceData = this.getData();
        this.deviceRequestControl(deviceData.ip); // initialize the app
		this.deviceRequestSensor(deviceData.ip);  // initialize the app
	}

    // this method is called when the Device is deleted
    onDeleted() {
        this.log('device deleted');
		
    }

//----------------------
 
    // Update settings of Airconditioner
    
    //step 1 - retrieve control_info
    deviceUpdateStep1(control_info, control_response) {
		this.log('deviceUpdateStep1');        

        var deviceData = this.getData();     
		var inverter_ip = deviceData.ip; 
        
        util.request_control(inverter_ip, this.deviceUpdateStep2.bind(this));
        
        return Promise.resolve();
    }

    //step 2 - update control_info
    deviceUpdateStep2(control_info, control_response) {
		this.log('deviceUpdateStep2');        

        var deviceData = this.getData();
		var inverter_ip = deviceData.ip;  
        var oldDeviceState = control_info[4]; // as we haven't updated the airco yet...
        var newDeviceState = this.getCapabilityValue('airco_temperature');
        var change = ( newDeviceState - oldDeviceState);
        
        if ( oldDeviceState === null ) { change = 0; } // oldDeviceState === null when we initialize...    
        this.log('temp change', change);

        /*var temp = util.minimize_opt(control_response);
        this.log('minimize applied: ', temp);
        temp.stemp = (parseInt(control_response.stemp) + change).toString();
        var opts = JSON.stringify(temp); // this string is POSTed to the airco
        this.log('minimized and temp update applied, this is send to POST to the airco: ', opts);
        util.send_control(inverter_ip, opts);
        */
        return Promise.resolve();
    }

    // Interrogate Airconditioner Status
	deviceRequestControl(ip_address) {
		this.log('deviceRequestControl');
	    
		var inverter_ip = ip_address;
	    util.request_control(inverter_ip, this.updateControlListeners.bind(this));
		
		return Promise.resolve();
    }

    // Interrogate Airconditioner Temperature Sensor
	deviceRequestSensor(ip_address) {
		this.log('deviceRequestSensor');
				
	    var inverter_ip = ip_address;
	    util.request_sensor(inverter_ip, this.updateSensorListeners.bind(this));
		
		return Promise.resolve();
    }

   // Update the app after interrogation of control_request
	updateControlListeners(control_info, control_response) {        
		this.log('updateControlListeners');
        
        // mode
        var airco_modes = [ "AUTO-0", "AUTO-1", "DEHUMID", "COOLING", "HEATING", "-", "FAN", "AUTO-7" ];                        
        const amode = Number(control_info[2]);
        const airco_mode = airco_modes[amode];	
        this.onCapabilityMode(airco_mode);

        // temperature
		const atemp = Number(control_info[4]);
		this.onCapabilityAircoTemp(atemp);

        // humidity
		const ahum = Number(control_info[5]);      
        this.onCapabilityAircoHum(ahum);      

        // fan rate
        var fan_rates = [ "AUTO", "SILENCE", "LVL-1", "LVL-2", "LVL-3", "LVL-4", "LVL-5"];
		var frate_nbr = -1;
        const frate = String(control_info[23]);
        // the if's are a little messi... have to sleep about this...
        if (frate == "A") { frate_nbr = 0; }
        if (frate == "B") { frate_nbr = 1; } 
        if ( frate_nbr !=0 && frate_nbr != 1 ) { frate_nbr = parseInt(frate); }
        const fan_rate = fan_rates[frate_nbr];           
        this.onCapabilityFanRate(fan_rate);   
        
        // fan direction
        var fan_directions = [ "OFF", "VERTICAL", "HORIZONTAL", "3D" ];
		const fdir = Number(control_info[24]);      
        const fan_direction = fan_directions[fdir];   
        this.onCapabilityFanDir(fan_direction);           
        	
		return Promise.resolve();
	}

   // Update the app after interrogation of sensor_request
	updateSensorListeners(sensor_info) {        
		this.log('updateSensorListeners');
		                        
		const inside = Number(sensor_info[1]);
		const outside = Number(sensor_info[3]);
		
		this.onCapabilityMeasureTemperature(inside, outside);
			
		return Promise.resolve();
	}

//----------------------
	
    // Capability 1: Device get/set mode
    onCapabilityMode(amode) {
		this.log('onCapabilityMode');

		this.log('mode:', amode);
    	this.setCapabilityValue('airco_mode', amode);
	}

    // Capability 2: Device get/set fan rate
    onCapabilityFanRate(frate) {
		this.log('onCapabilityFanRate');

		this.log('fan rate:', frate);
    	this.setCapabilityValue('fan_rate', frate);
	}

    // Capability 3: Device get/set fan direction
    onCapabilityFanDir(fdir) {
		this.log('onCapabilityFanDir');

		this.log('fan direction:', fdir);
    	this.setCapabilityValue('fan_direction', fdir);
	}

    // Capability 4: Device get/set humidity
    onCapabilityAircoHum(ahum) {
		this.log('onCapabilityAircoHum');

		this.log('humidity %:', ahum);
    	this.setCapabilityValue('airco_humidity', ahum);
	}
        
    // Capability 5: Device get/set target temperature
    onCapabilityAircoTemp(atemp) {
		this.log('onCapabilityAircoTemp');

        this.setCapabilityValue('airco_temperature', atemp);
        this.log('temperature °C:', atemp);
        
        this.deviceUpdateStep1();
    }        
    	
    // Capability 6 & 7: Device measure in/outside temperature
    onCapabilityMeasureTemperature(inside, outside) {
		this.log('onCapabilityMeasureTemperature');

		this.log('temperature inside °C', inside);
		this.log('temperature outside °C:', outside);
		this.setCapabilityValue('measure_temperature.inside', inside);
        this.setCapabilityValue('measure_temperature.outside', outside);
	}

}

module.exports = DaikinDevice;