var SESSION_STATUS = Flashphoner.constants.SESSION_STATUS; 
var CALL_STATUS = Flashphoner.constants.CALL_STATUS;
var MEDIA_DEVICE_KIND = Flashphoner.constants.MEDIA_DEVICE_KIND;
var localVideo;
var remoteVideo;
var currentCall;
var statIntervalId;

$(document).ready(function () {
    loadCallFieldSet();
});

function loadStats() {
    if (currentCall) {
        currentCall.getStats(function (stats) {
            if (stats && stats.outboundStream) {
                if (stats.outboundStream.videoStats) {
                    $('#videoStatBytesSent').text(stats.outboundStream.videoStats.bytesSent);
                    $('#videoStatPacketsSent').text(stats.outboundStream.videoStats.packetsSent);
                    $('#videoStatFramesEncoded').text(stats.outboundStream.videoStats.framesEncoded);
                } else {
                    $('#videoStatBytesSent').text(0);
                    $('#videoStatPacketsSent').text(0);
                    $('#videoStatFramesEncoded').text(0);
                }

                if (stats.outboundStream.audioStats) {
                    $('#audioStatBytesSent').text(stats.outboundStream.audioStats.bytesSent);
                    $('#audioStatPacketsSent').text(stats.outboundStream.audioStats.packetsSent);
                } else {
                    $('#audioStatBytesSent').text(0);
                    $('#audioStatPacketsSent').text(0);
                }
            }
        });
    }
}

// Include Field Set HTML
function loadCallFieldSet() {
    $("#callFieldSet").load("call-fieldset.html",loadCallControls);
}

// Include Call Controls HTML
function loadCallControls(){
    $("#callControls").load("call-controls.html", loadVideoCallStatistics);
}

function loadVideoCallStatistics() {
    $("#callVideoStatistics").load("call-video-statistics.html", loadAudioCallStatistics)
}

function loadAudioCallStatistics() {
    $("#callAudioStatistics").load("call-audio-statistics.html", init_page)
}

function init_page(){
	//init api
    try {
        Flashphoner.init({flashMediaProviderSwfLocation: '../../../../media-provider.swf',
            mediaProvidersReadyCallback: function(mediaProviders) {
                //hide remote video if current media provider is Flash
                if (mediaProviders[0] == "Flash") {
                    $("#remoteVideoWrapper").hide();
                    $("#localVideoWrapper").attr('class', 'fp-remoteVideo');
                }
            }});
    } catch(e) {
        $("#notifyFlash").text("Your browser doesn't support Flash or WebRTC technology necessary for work of an example");
        return;
    }

    if(!Browser.isChrome()) {
        $('#speakerForm').remove();
    }

    Flashphoner.getMediaDevices(null, true, MEDIA_DEVICE_KIND.ALL).then(function (list) {
        for (var type in list) {
            if (list.hasOwnProperty(type)) {
                list[type].forEach(function(device) {
                    if (device.type == "mic") {
                        var list = document.getElementById("micList");
                        if ($("#micList option[value='" + device.id + "']").length == 0) {
                            var option = document.createElement("option");
                            option.text = device.label || device.id;
                            option.value = device.id;
                            list.appendChild(option);
                        }
                    } else if (device.type == "speaker") {
                        var list = document.getElementById("speakerList");
                        if (list && $("#speakerList option[value='" + device.id + "']").length == 0) {
                            var option = document.createElement("option");
                            option.text = device.label || device.id;
                            option.value = device.id;
                            list.appendChild(option);
                        }
                    } else if (device.type == "camera") {
                        var list = document.getElementById("cameraList");
                        if ($("#cameraList option[value='" + device.id + "']").length == 0) {
                            var option = document.createElement("option");
                            option.text = device.label || device.id;
                            option.value = device.id;
                            list.appendChild(option);
                        }
                    }
                });
            }
        
        }
        $( "#speakerList" ).change(function() {
            if (currentCall) {
                currentCall.setAudioOutputId($(this).val());
            }
        });
    }).catch(function (error) {

        $("#notifyFlash").text("Failed to get media devices "+error);
    });

	//local and remote displays
    localVideo = document.getElementById("localVideo");
    remoteVideo = document.getElementById("remoteVideo");

    // Set websocket URL
    $("#urlServer").val(setURL());

	// Display outgoing call controls
    showOutgoing();

    onHangupOutgoing();
    onDisconnected();
    $("#holdBtn").click(function(){
        var state = $(this).text();
        if (state == "Hold") {
            $(this).text("Unhold");
            currentCall.hold();
        } else {
            $(this).text("Hold");
            currentCall.unhold();
        }
        $(this).prop('disabled',true);
    });

    $("#cameraList").change(function() {
        if (currentCall) {
            currentCall.switchCam($(this).val());
        }
    });
    $("#micList").change(function() {
        if (currentCall) {
            currentCall.switchMic($(this).val());
        }
    });
  
    $("#switchCamBtn").click(function() {
       if (currentCall) {
           currentCall.switchCam().then(function(id) {
               $('#cameraList option:selected').prop('selected', false);
               $("#cameraList option[value='"+ id +"']").prop('selected', true);
           }).catch(function(e) {
               console.log("Error " + e);
           });
       }
    }).prop('disabled', true);
    $("#switchMicBtn").click(function() {
        if (currentCall) {
            currentCall.switchMic().then(function(id) {
                $('#micList option:selected').prop('selected', false);
                $("#micList option[value='"+ id +"']").prop('selected', true);
            }).catch(function(e) {
                console.log("Error " + e);
            });
        }
    }).prop('disabled', true);
    $("#switchSpkBtn").click(function() {
        if (currentCall) {
            var id = $('#speakerList').find(":selected").val();
            currentCall.setAudioOutputId(id);
        }
    }).prop('disabled', true);
}

function connect() {
    if (Browser.isSafariWebRTC() && Flashphoner.getMediaProviders()[0] === "WebRTC") {
        Flashphoner.playFirstVideo(localVideo, true);
        Flashphoner.playFirstVideo(remoteVideo, false);
    }

	var url = $('#urlServer').val();
    var registerRequired = $("#sipRegisterRequired").is(':checked');

    var sipOptions = {
	    login: $("#sipLogin").val(),
        authenticationName: $("#sipAuthenticationName").val(),
		password: $("#sipPassword").val(),
		domain: $("#sipDomain").val(),
        outboundProxy: $("#sipOutboundProxy").val(),
		port: $("#sipPort").val(),
        registerRequired: registerRequired
    };

    var connectionOptions = {
        urlServer: url,
        sipOptions: sipOptions
    };

    //create session
    console.log("Create new session with url " + url);
    Flashphoner.createSession(connectionOptions).on(SESSION_STATUS.ESTABLISHED, function(session){
        setStatus("#regStatus", SESSION_STATUS.ESTABLISHED);
        onConnected(session);
		if (!registerRequired) {
            disableOutgoing(false);
		}
    }).on(SESSION_STATUS.REGISTERED, function(session){
        setStatus("#regStatus", SESSION_STATUS.REGISTERED);
        onConnected(session);
        if (registerRequired) {
            disableOutgoing(false);
		}
    }).on(SESSION_STATUS.DISCONNECTED, function(){
        setStatus("#regStatus", SESSION_STATUS.DISCONNECTED);
        onDisconnected();
    }).on(SESSION_STATUS.FAILED, function(){
        setStatus("#regStatus", SESSION_STATUS.FAILED);
        onDisconnected();
    }).on(SESSION_STATUS.INCOMING_CALL, function(call){
        call.on(CALL_STATUS.RING, function(){
		    setStatus("#callStatus", CALL_STATUS.RING);
        }).on(CALL_STATUS.HOLD, function() {
            $("#holdBtn").prop('disabled',false);
        }).on(CALL_STATUS.ESTABLISHED, function(){
		    setStatus("#callStatus", CALL_STATUS.ESTABLISHED);
			enableMuteToggles(true);
            $("#holdBtn").prop('disabled',false);
            $('[id^=switch]').prop('disabled', false);
        }).on(CALL_STATUS.FINISH, function(){
		    setStatus("#callStatus", CALL_STATUS.FINISH);
			onHangupIncoming();
		    currentCall = null;
        }).on(CALL_STATUS.FAILED, function(){
            setStatus("#callStatus", CALL_STATUS.FAILED);
            onHangupIncoming();
            currentCall = null;
        });
		onIncomingCall(call);
    });
}

function call() {
	var session = Flashphoner.getSessions()[0];
    var constraints = getConstraints();
    var outCall = session.createCall({
		callee: $("#callee").val(),
        visibleName: $("#sipLogin").val(),
        remoteVideoDisplay: remoteVideo,
        localVideoDisplay: localVideo,
        constraints: constraints,
        sdpHook: rewriteSdp,
        stripCodecs:"SILK"
	}).on(CALL_STATUS.RING, function(){
		setStatus("#callStatus", CALL_STATUS.RING);
    }).on(CALL_STATUS.ESTABLISHED, function(){
		setStatus("#callStatus", CALL_STATUS.ESTABLISHED);
        onAnswerOutgoing();
        $("#holdBtn").prop('disabled',false);
    }).on(CALL_STATUS.HOLD, function() {
        $("#holdBtn").prop('disabled',false);
    }).on(CALL_STATUS.FINISH, function(){
		setStatus("#callStatus", CALL_STATUS.FINISH);
	    onHangupOutgoing();
		currentCall = null;
    }).on(CALL_STATUS.FAILED, function(){
        setStatus("#callStatus", CALL_STATUS.FAILED);
        onHangupIncoming();
        currentCall = null;
    });
	outCall.setAudioOutputId($('#speakerList').find(":selected").val());
	outCall.call();
	currentCall = outCall;
    statIntervalId = setInterval(loadStats, 2000);

	$("#callBtn").text("Hangup").off('click').click(function(){
        $(this).prop('disabled', true);
	    outCall.hangup();
    }).prop('disabled', false);
}

function onConnected(session) {
    $("#connectBtn").text("Disconnect").off('click').click(function(){
        $(this).prop('disabled', true);
		if (currentCall) {
			showOutgoing();
			disableOutgoing(true);
			setStatus("#callStatus", "");
			currentCall.hangup();
		}
        session.disconnect();
    }).prop('disabled', false);
}

function onDisconnected() {
    $("#connectBtn").text("Connect").off('click').click(function(){
		if (validateForm("formConnection")) {
			disableConnectionFields("formConnection", true);
			$(this).prop('disabled', true);
			connect();
		}
    }).prop('disabled', false);
    disableConnectionFields("formConnection", false);
    disableOutgoing(true);
    showOutgoing();
    setStatus("#callStatus", "");
}

function onHangupOutgoing() {
    $("#callBtn").text("Call").off('click').click(function(){
		if (filledInput($("#callee"))) {
			disableOutgoing(true);
			call();
		}
    }).prop('disabled', false);
    $('#callee').prop('disabled', false);
    $("#callFeatures").hide();
    $("#holdBtn").text("Hold");
    $('[id^=switch]').prop('disabled', true);
	disableOutgoing(false);
	enableMuteToggles(false);
}

function onIncomingCall(inCall) {
	currentCall = inCall;
	var constraints = getConstraints();
	showIncoming(inCall.visibleName());

    statIntervalId = setInterval(loadStats, 2000);
    $("#answerBtn").off('click').click(function(){
		$(this).prop('disabled', true);
        inCall.setAudioOutputId($('#speakerList').find(":selected").val());
        inCall.answer({
                localVideoDisplay: localVideo,
                remoteVideoDisplay: remoteVideo,
                constraints: constraints,
                sdpHook: rewriteSdp,
                stripCodecs:"SILK"
            });
		showAnswered();
    }).prop('disabled', false);
	
    $("#hangupBtn").off('click').click(function(){
		$(this).prop('disabled', true);
		$("#answerBtn").prop('disabled', true);
        inCall.hangup();
    }).prop('disabled', false);
}

function onHangupIncoming() {
clearInterval(statIntervalId);
    $('[id^=switch]').prop('disabled', true);
    showOutgoing();
	enableMuteToggles(false);
}

function onAnswerOutgoing() {
    enableMuteToggles(true);
    $("#callFeatures").show();
    $('[id^=switch]').prop('disabled', false);
}

// Set connection and call status
function setStatus(selector, status) {
    var statusField = $(selector);
    statusField.text(status).removeClass();
    if (status == "REGISTERED" || status == "ESTABLISHED") {
        statusField.attr("class","text-success");
    } else if (status == "DISCONNECTED" || status == "FINISH") {
        statusField.attr("class","text-muted");
    } else if (status == "FAILED") {
        statusField.attr("class","text-danger");
    } else if (status == "TRYING" || status == "RING") {
        statusField.attr("class","text-primary");
    }
}

// Display view for incoming call
function showIncoming(callerName){
    $("#outgoingCall").hide();
    $("#incomingCall").show();
    $("#incomingCallAlert").show().text("You have a new call from " + callerName);
    $("#answerBtn").show();
}

// Display view for outgoing call
function showOutgoing(){
    $("#incomingCall").hide();
    $("#incomingCallAlert").hide();
    $("#outgoingCall").show();
    $("#callFeatures").hide();
    onHangupOutgoing();
}

function disableOutgoing(disable) {
    $('#callee').prop('disabled', disable);
    $("#callBtn").prop('disabled', disable);
}

// Display view for answered call
function showAnswered(){
    $("#answerBtn").hide();
    $("#callFeatures").show();
    $("#incomingCallAlert").hide().text("");
}

function disableConnectionFields(formId, disable) {
    $('#' + formId + ' :text').each(function(){
       $(this).prop('disabled', disable);
    });
	$('#' + formId + ' :password').prop('disabled', disable);
    $('#' + formId + ' :checkbox').prop('disabled', disable);
}

function validateForm(formId) {
    var valid = true;
	
    $('#' + formId + ' :text').each(function(){
        if(!filledInput($(this)) && valid) {
			valid = false;
		}
    });
	
	if(!filledInput($('#' + formId + ' :password')) && valid) {
		valid = false;
	}
	
    return valid;
}

function filledInput(input) {
	var valid = true;
    if (!input.val()) {
		valid = false;
        input.closest('.input-group').addClass("has-error");
    } else {
        input.closest('.input-group').removeClass("has-error");
    }
	
	return valid;
}

// Mute audio in the call
function mute() {
	if (currentCall) {
	    currentCall.muteAudio();
	}
}

// Unmute audio in the call
function unmute() {
	if (currentCall) {
        currentCall.unmuteAudio();
	}
}

// Mute video in the call
function muteVideo() {
	if (currentCall) {
        currentCall.muteVideo();
	}
}

// Unmute video in the call
function unmuteVideo() {
	if (currentCall) {
        currentCall.unmuteVideo();
    }
}

function getConstraints() {
    var constraints = {
        audio: {deviceId: {exact: $('#micList').find(":selected").val()}},
        video: {
            deviceId: {exact: $('#cameraList').find(":selected").val()},
            width: parseInt($('#sendWidth').val()),
            height: parseInt($('#sendHeight').val())
        }
    };
    if (Browser.isSafariWebRTC() && Browser.isiOS() && Flashphoner.getMediaProviders()[0] === "WebRTC") {
        constraints.video.width = {min: parseInt($('#sendWidth').val()), max: 640};
        constraints.video.height = {min: parseInt($('#sendHeight').val()), max: 480};
    }
    return constraints;
}

function enableMuteToggles(enable) {
    var $muteAudioToggle = $("#muteAudioToggle");
    var $muteVideoToggle = $("#muteVideoToggle");
	
	if (enable) {
		$muteAudioToggle.removeAttr("disabled");
		$muteAudioToggle.trigger('change');
		$muteVideoToggle.removeAttr("disabled");
		$muteVideoToggle.trigger('change');
	}
	else {
		$muteAudioToggle.prop('checked',false).attr('disabled','disabled').trigger('change');
		$muteVideoToggle.prop('checked',false).attr('disabled','disabled').trigger('change');
    }
}

function rewriteSdp(sdp) {
    var sdpStringFind = $("#sdpStringFind").val();
    var sdpStringReplace = $("#sdpStringReplace").val();
    if (sdpStringFind != 0 && sdpStringReplace != 0) {
        var newSDP = sdp.sdpString.toString();
        newSDP = newSDP.replace(sdpStringFind, sdpStringReplace);
        return newSDP;
    }
    return sdp.sdpString;
}