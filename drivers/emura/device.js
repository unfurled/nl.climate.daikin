"use strict";

const Homey = require('homey');
const Device = require('../../lib/device');
const util = require('../../lib/daikin');

// Device for a Daikin Emura device
class EmuraDevice extends Device {

    onInit() {						

		super.onInit();

		this.log('Emura capability registration started...');
        this.registerCapabilityListener('airco_mode', this.onCapabilityMode.bind(this));
        this.registerCapabilityListener('airco_mode_extended', this.onCapabilityExtendedMode.bind(this));
		this.registerCapabilityListener('fan_rate', this.onCapabilityFanRate.bind(this));
		this.registerCapabilityListener('fan_direction', this.onCapabilityFanDir.bind(this));
		this.registerCapabilityListener('set_humidity', this.onCapabilityAircoHum.bind(this));
        this.registerCapabilityListener('set_temperature', this.onCapabilityAircoTemp.bind(this));
		this.registerCapabilityListener('measure_temperature.inside', this.onCapabilityMeasureTemperature.bind(this));
        this.registerCapabilityListener('measure_temperature.outside', this.onCapabilityMeasureTemperature.bind(this));
                
		this.log('Emura registration of Capabilities and Report Listeners completed!');
        
        // for documentation about the Daikin API look at https://github.com/Apollon77/daikin-controller and at
        // https://github.com/Apollon77/daikin-controller

    	this.setCapabilityValue('airco_mode', "off");  // ensure a valid mode is shown at start up...
    	this.setCapabilityValue('airco_mode_extended', "off");  // ensure a valid mode is shown at start up...
        
        this.emuraIsDeleted = false;
        this.refreshData(); // refresh every x-seconds the Homey app with data retrieved from the airco...

    }
		
	onAdded() {
		this.log('Emura device added');

	}

    // this method is called when the Device is deleted
    onDeleted() {
        this.log('Emura device deleted');
        
        this.setSettings({emura_ip: "0.0.0.0", emura_interval: 0})
            .then(this.log('settings for Emura are cleared'));
            
        this.emuraIsDeleted = true;
        
    }

//-------- app capabilities --------------
    	
    // Capability 1: Device get/set mode
    onCapabilityMode(airco_mode) {
		this.log('onCapabilityMode');
		this.log('mode:', airco_mode);
        
    	this.setCapabilityValue('airco_mode', airco_mode);
        
        this.daikinModeControl(airco_mode);

		return Promise.resolve();  
	}
    
    onCapabilityExtendedMode(airco_mode_extended) {
		this.log('onCapabilityExtendedMode');
        this.log('extended mode:', airco_mode_extended);
        
    	this.setCapabilityValue('airco_mode_extended', airco_mode_extended);
        
        this.daikinModeControl(airco_mode_extended);

		return Promise.resolve();  
	}
    
    // Capability 2: Device get/set fan rate
    onCapabilityFanRate(fan_rate) {
		this.log('onCapabilityFanRate');

		this.log('fan rate:', fan_rate);
    	this.setCapabilityValue('fan_rate', fan_rate);
        
        this.daikinFanRateControl(fan_rate);

		return Promise.resolve();  
	}

    // Capability 3: Device get/set fan direction
    onCapabilityFanDir(fan_direction) {
		this.log('onCapabilityFanDir');

		this.log('fan direction:', fan_direction);
    	this.setCapabilityValue('fan_direction', fan_direction);
        
        this.daikinFanDirControl(fan_direction);

		return Promise.resolve();  
	}

    // Capability 4: Device get/set humidity
    onCapabilityAircoHum(ahum) {
		this.log('onCapabilityAircoHum');

		this.log('humidity %:', ahum);
    	this.setCapabilityValue('set_humidity', ahum);
        
        return Promise.resolve();  
	}
      
    // Capability 5: Device get/set target temperature
    onCapabilityAircoTemp(atemp, opts) {
		this.log('onCapabilityAircoTemp');

 	    var oldTargetTemperature = this.getState().set_temperature;
        this.log('oldTargetTemperature: ', oldTargetTemperature);
 	    
        if (oldTargetTemperature != atemp) {
           this.log('new target airco temperature °C:', atemp);        
 	   	   this.setCapabilityValue('set_temperature', atemp);
       
 	   	   let device = this;
 	   	   let tokens = {
 	   		   'temperature_set': atemp
 	   	   };
       
 	   	   let state  = {
 	   		   'set_temperature': atemp
 	   	   }
       
 	   	   // trigger temperature flows
 	   	   let driver = this.getDriver();
 	   	   driver
 	   			.triggerTargetTemperatureMoreThan(device, tokens, state)
 	   			.triggerTargetTemperatureLessThan(device, tokens, state)
 	   			.triggerTargetTemperatureBetween(device, tokens, state);
           
           // update the airco its settings         
           this.daikinTempControl(atemp);
 	   	}
       
		return Promise.resolve(); 
        
    }        
   	
    // Capability 6 & 7: Device measure in/outside temperature    
    onCapabilityMeasureTemperature(inside, outside) {
		this.log('onCapabilityMeasureTemperature');

        // updates by interrogation of the airco, refer to refreshData method.

		return Promise.resolve();      
	
    }

//-------- airco data retrieval and app refresh/update methods --------------

    // look for changes in the airco its settings made outside of Homey app...
    refreshData() {
		this.log('refreshData');
        
        if (this.emuraIsDeleted) {
            this.log('Emura device has been deleted, the refresh loop is now stopped...');
            
            return;
        }

        var settings = this.getSettings();
        var emura_ip = settings.emura_ip; this.log('Emura ip-address: ', emura_ip);        
        var emura_interval = settings.emura_interval||10; // to prevent "undefined"...
        this.log('Refresh interval: ', emura_interval);

        this.deviceRequestControl(emura_ip);      
		this.deviceRequestSensor(emura_ip);
     
        setTimeout(this.refreshData.bind(this), emura_interval * 1000);
        
    }

    // Interrogate Airconditioner Status
	deviceRequestControl(emura_ip) {
		this.log('deviceRequestControl');
	    
	    util.request_control(emura_ip, this.updateControlListeners.bind(this));
		
		return Promise.resolve();
    }

    // Interrogate Airconditioner Temperature Sensor
	deviceRequestSensor(emura_ip) {
		this.log('deviceRequestSensor');
				
	    util.request_sensor(emura_ip, this.updateSensorListeners.bind(this));
		
		return Promise.resolve();
    }

   // Update the app after interrogation of control_request
	updateControlListeners(control_info, control_response) {        
		this.log('updateControlListeners');

    //---- power status
        const apow = Number(control_info[1]);
        
    //---- mode
        var airco_modes = [ "auto", "auto1", "dehumid", "cooling", "heating", "off", "fan", "auto2", "streamer", "powerful", "econo" ]; 
        
        var settings = this.getSettings();
        var emura_spmode = settings.emura_spmode;
        this.log('Special mode set:', emura_spmode);  
        
        if (emura_spmode == true) {                      
          var amode = Number(control_info[2]);
          if ((amode == 1) || (amode == 7)) amode = 0; // do not differentiate the modes: auto1 and auto2
                    
          var advmode = Number(control_info[3]);
          if (advmode == 13) amode = 8;
          if (advmode == 2) amode = 9;
          if (advmode == 12) amode = 10;

          const airco_mode = airco_modes[amode];          
          const capability_mode = this.getCapabilityValue('airco_mode_extended');
          // when the airco is tured off then Daikin AI should show mode "OFF" and keep showing that mode iso the airco mode
          if ((capability_mode != "off")) this.setCapabilityValue('airco_mode_extended', airco_mode);
          // but when the airco is powered on externally make sure that capability mode "OFF" is cleared by
          // setting it to "auto" which will be overruled by the correct airco mode the next refreshData loop
          if ((apow == 1) && (capability_mode == "off")) this.setCapabilityValue('airco_mode_extended', "auto");
          // when the airo is powered off externally make sure that capability mode "OFF" is set
          if ((apow == 0) && (capability_mode != "off")) this.setCapabilityValue('airco_mode_extended', "off");
          
          this.log('extended mode:', airco_mode);
          this.log('extended capability_mode:', capability_mode);
          this.log('emura_spmode_kind:', advmode);
        }
        else {
          var amode = Number(control_info[2]);
          if ((amode == 1) || (amode == 7)) amode = 0; // do not differentiate the modes: auto1 and auto2
          
          const airco_mode = airco_modes[amode];
          const capability_mode = this.getCapabilityValue('airco_mode');
          // when the airco is tured off then Daikin AI should show mode "OFF" and keep showing that mode iso the airco mode
          if ((capability_mode != "off")) this.setCapabilityValue('airco_mode', airco_mode);
          // but when the airco is powered on externally make sure that capability mode "OFF" is cleared by
          // setting it to "auto" which will be overruled by the correct airco mode the next refreshData loop
          if ((apow == 1) && (capability_mode == "off")) this.setCapabilityValue('airco_mode', "auto");
          // when the airo is powered off externally make sure that capability mode "OFF" is set
          if ((apow == 0) && (capability_mode != "off")) this.setCapabilityValue('airco_mode', "off");
          
          this.log('mode:', airco_mode);
          this.log('capability_mode:', capability_mode);
        } 
            
    //---- temperature
		const atemp = Number(control_info[4]);
        this.log('target temperature °C:', atemp);  
        this.setCapabilityValue('set_temperature', atemp);
        
    //---- humidity
		const ahum = Number(control_info[5]);      
    	this.setCapabilityValue('set_humidity', ahum);              
        
    //---- fan rate
        var fan_rates = [ "A", "B", "3", "4", "5", "6", "7"];
		var frate_nbr = -1;
        const frate = String(control_info[23]);
        if (frate == "A") { frate_nbr = 0; }
        if (frate == "B") { frate_nbr = 1; } 
        if ( frate_nbr !=0 && frate_nbr != 1 ) { frate_nbr = parseInt(frate - 1); }
        const fan_rate = fan_rates[frate_nbr];
        this.log('frate:', fan_rate);            
    	this.setCapabilityValue('fan_rate', fan_rate);
            
    //---- fan direction
        var fan_directions = [ "0", "1", "2", "3" ];
		const fdir = Number(control_info[24]);      
        const fan_direction = fan_directions[fdir];             
    	this.setCapabilityValue('fan_direction', fan_direction);
        this.log('fdir:', fan_direction);                 	

		return Promise.resolve();
	}

   // Update the app after interrogation of sensor_request
	updateSensorListeners(sensor_info) {        
		this.log('updateSensorListeners');

	    var oldInsideTemperature = this.getState()['measure_temperature.inside'];
        this.log('oldInsideTemperature: ', oldInsideTemperature);
 	    var oldOutsideTemperature = this.getState()['measure_temperature.outside'];
        this.log('oldOutsideTemperature: ', oldOutsideTemperature);   

		const inside = Number(sensor_info[1]);
		const outside = Number(sensor_info[3]);
		this.setCapabilityValue('measure_temperature.inside', inside);
        this.log('Temp inside:', inside);     
        this.setCapabilityValue('measure_temperature.outside', outside);
        this.log('Temp outside:', outside);            		

    //--- Flowcards logic
        if (oldInsideTemperature != inside) {
           this.log('new inside airco temperature °C:', inside);        
           this.setCapabilityValue('measure_temperature.inside', inside);

	   	   let device = this;
	   	   let tokens = {
	   		   'inside_temperature': inside
	   	   };

	   	   let state  = {
	   		   'measure_temperature.inside': inside
	   	   }

	   	   // trigger inside temperature flows
	   	   let driver = this.getDriver();
	   	   driver
	   			.triggerInsideTemperatureMoreThan(device, tokens, state)
	   			.triggerInsideTemperatureLessThan(device, tokens, state)
	   			.triggerInsideTemperatureBetween(device, tokens, state);

        }
         	    
        if (oldOutsideTemperature != outside) {
           this.log('new outside airco temperature °C:', outside);        
           this.setCapabilityValue('measure_temperature.outside', outside);
       
 	   	   let device = this;
 	   	   let tokens = {
 	   		   'outside_temperature': outside
 	   	   };
       
 	   	   let state  = {
 	   		   'measure_temperature.outside': outside
 	   	   }
       
 	   	   // trigger outside temperature flows
 	   	   let driver = this.getDriver();
 	   	   driver
 	   			.triggerOutsideTemperatureMoreThan(device, tokens, state)
 	   			.triggerOutsideTemperatureLessThan(device, tokens, state)
 	   			.triggerOutsideTemperatureBetween(device, tokens, state);

        }        		
		
		return Promise.resolve();
	}

//-------- airco control methods --------------

    // POST new Power settings to Airconditioner    
    daikinPowerControl(pow) {
       this.log('daikinPowerControl');

       var settings = this.getSettings();
       var emura_ip = settings.emura_ip;
       var emura_useGetToPost = settings.emura_useGetToPost;
       var emura_adapter = settings.emura_adapter;
       var emura_options = {};
       this.log('firmware < v2.0.1 (then useGetToPost):', emura_useGetToPost);
       this.log('Adapter model:', emura_adapter)
       
       if (emura_useGetToPost) emura_options = {'useGetToPost': true};
       else emura_options = {'useGetToPost': false};
              
       var daikin = new DaikinAC(emura_ip, emura_options, function(err) {

           daikin.setACControlInfo({"pow":pow});           
       });
       this.log('Power control: ', pow);      
    }

    // POST new Mode settings to Airconditioner    
    daikinModeControl(acmode) {
       this.log('daikinModeControl');

       var settings = this.getSettings();
       var emura_ip = settings.emura_ip;
       var emura_spmode = settings.emura_spmode;
       var demo_mode = settings.emura_demomode;
       var emura_useGetToPost = settings.emura_useGetToPost;
       var emura_adapter = settings.emura_adapter;
       var emura_options = {};
       this.log('firmware < v2.0.1 (then useGetToPost):', emura_useGetToPost);
       this.log('Adapter model:', emura_adapter)
       
       if (emura_useGetToPost) emura_options = {'useGetToPost': true};
       else emura_options = {'useGetToPost': false};
       
       if (emura_spmode == false) {
           this.log('airco_mode:', acmode);
           
           util.daikinModeControl(acmode, emura_ip, emura_options, demo_mode);           
       } else {
           this.log('airco_mode_extended:', acmode);
           
           // step 1 - set mode
           util.daikinModeControl(acmode, emura_ip, emura_options, demo_mode);
           
           // step 2 - set advanced/special mode ON/OFF and function selection
           switch (acmode) {
               case "streamer":   var advstate = 1;
                                  this.log('Special mode: ON, function: Streamer');
                                  break;

              case "powerful":    var advstate = 1;
                                  this.log('Special mode: ON, function: Powerful');
                                  break;
                                  
              case "econo":       var advstate = 1;
                                  this.log('Special mode: ON, function: Economy');
                                  break;
                                                
              default:            var advstate = 0;
                                  this.log('Special mode: OFF');
                                  return;
              
           }
           
           util.daikinSpecialModeControl(acmode, emura_ip, emura_options, advstate);           
   
       }
    }

    // POST new Fan Rate settings to Airconditioner    
    daikinFanRateControl(fan_rate) {
       this.log('daikinFanRateControl');
    
       var settings = this.getSettings();
       var emura_ip = settings.emura_ip;
       var emura_useGetToPost = settings.emura_useGetToPost;
       var emura_adapter = settings.emura_adapter;
       var emura_options = {};
       this.log('firmware < v2.0.1 (then useGetToPost):', emura_useGetToPost);
       this.log('Adapter model:', emura_adapter)
       
       if (emura_useGetToPost) emura_options = {'useGetToPost': true};
       else emura_options = {'useGetToPost': false};
       
       util.daikinFanRateControl(fan_rate, emura_ip, emura_options);
       
    }  

    // POST new Fan Rate settings to Airconditioner    
    daikinFanDirControl(fan_direction) {
       this.log('daikinFanDirControl');
    
       var settings = this.getSettings();
       var emura_ip = settings.emura_ip;
       var emura_useGetToPost = settings.emura_useGetToPost;
       var emura_adapter = settings.emura_adapter;
       var emura_options = {};
       this.log('firmware < v2.0.1 (then useGetToPost):', emura_useGetToPost);
       this.log('Adapter model:', emura_adapter)
       
       if (emura_useGetToPost) emura_options = {'useGetToPost': true};
       else emura_options = {'useGetToPost': false};
       
       util.daikinFanDirControl(fan_direction, emura_ip, emura_options);
      
    }  
       
    // POST new Temperature settings to Airconditioner    
    daikinTempControl(atemp) {
       this.log('daikinTempControl');

       var settings = this.getSettings();
       var emura_ip = settings.emura_ip;
       var emura_useGetToPost = settings.emura_useGetToPost;
       var emura_adapter = settings.emura_adapter;
       var emura_options = {};
       
       this.log('firmware < v2.0.1 (then useGetToPost):', emura_useGetToPost);
       this.log('Adapter model:', emura_adapter)
       
       if (emura_useGetToPost) emura_options = {'useGetToPost': true};
       else emura_options = {'useGetToPost': false};

       util.daikinTempControl(atemp, emura_ip, emura_options);

    }

}

module.exports = EmuraDevice;