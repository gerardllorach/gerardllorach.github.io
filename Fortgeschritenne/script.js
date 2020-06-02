// The main global scope
console.log("v0.12");

// Variables

startDemo = () => {
  // Start audio context and declare variables
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioContext();
  let soundSource;
  let soundBuffer = {};
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  console.log("Sampling rate: " + audioCtx.sampleRate);
  analyser.smoothingTimeConstant = 0.0;
  const waveBuffer = new Float32Array(analyser.fftSize);
  const prevWaveBuffer = new Float32Array(analyser.fftSize);
  // Load AudioWorklet
  let vocoderNode = null;
  let workletBuffer = null;
  let workletBuffer2 = null;
  let pBlock = null;
  let oBlock = null;
  audioCtx.audioWorklet.addModule('vocoder.js').then(() => {
    console.log("Vocoder audioworklet loaded...");
    vocoderNode = new AudioWorkletNode(audioCtx, 'vocoder');
    window.vN = vocoderNode;
    vocoderNode.port.onmessage = (e) => {
      //console.log(e.data);
      if (e.data.buffer !== undefined){
        workletBuffer = e.data.buffer;
        workletBuffer2 = e.data.bufferPair;
        pBlock = e.data.pairBlock;
        oBlock = e.data.oddBlock;
      }
      if (e.data.message == 'Update'){
        console.log(e.data);
      }
    };
    //oscillator.connect(bypasser).connect(context.destination);
    //oscillator.start();
  });



  // DOM elements
  const playButton = document.getElementById("playButton");
  const filterButton = document.getElementById("filterButton");
  const vocoderButton = document.getElementById("vocoderButton");
  const selSoundContainer = document.getElementById("selSoundContainer");
  const selectAudioList = document.getElementById("selectAudio");
  const canvas = document.getElementById("myCanvas");
  const canvasCtx = canvas.getContext("2d");
  // Resize canvas
  canvas.width = document.body.clientWidth;
  canvas.height = document.body.clientHeight;

  // App control variables
  let playing = false;
  let filteron = false;


  // Vocal tract filter
  let feedForward = [1],
  feedBack = [1, -1.6685,    0.3762,    0.2547,    0.1319,    0.0317,   -0.0245,   -0.0428,   -0.0563,   -0.0250,    0.0000,    0.0185,    0.0356];
  // IIR filter
  const iirfilter = audioCtx.createIIRFilter(feedForward, feedBack);



  // Button actions
  // Play/Pause
  playButton.onclick = () => {
    if (playing === false) {
      // check if context is in suspended state (autoplay policy)
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      soundSource = audioCtx.createBufferSource();
      soundSource.buffer = soundBuffer[selectAudioList.value];
      
      // Destination and filtering
      /*if (!filteron){
        soundSource.connect(audioCtx.destination);
      } else{
        soundSource.connect(iirfilter).connect(audioCtx.destination);
      }*/
      // Vocoder destination
      if (!vocoderButton.checked){
        soundSource.connect(audioCtx.destination);
        // Anayser
        soundSource.connect(analyser);
      } else {
        soundSource.connect(vocoderNode).connect(audioCtx.destination);
        // Anayser
        soundSource.connect(vocoderNode).connect(analyser);
      }

      soundSource.start();
      playing = true;
      playButton.innerText = 'Pause sound';
    } else {
      soundSource.stop();
      vocoderNode.disconnect();
      soundSource.disconnect();
      playing = false;
      playButton.innerText = 'Play sound';
    }
  }


  filterButton.onclick = () => {
    /*if (filteron == false) {
      filteron = true;
      if (playing){
        soundSource.disconnect(audioCtx.destination);
        soundSource.connect(iirfilter).connect(audioCtx.destination);
      }
    
    } else {
      filteron = false;
      if (playing){
        soundSource.disconnect(iirfilter);
        soundSource.connect(audioCtx.destination);
      }
    }*/
  }

  vocoderButton.onclick = pathVocoder = () => {
    if (vocoderButton.checked){
      if (playing){
        vocoderNode.disconnect();
        soundSource.disconnect();
        soundSource.connect(vocoderNode).connect(audioCtx.destination);
        soundSource.connect(vocoderNode).connect(analyser);
      }
    } else {
      if (playing) {
        vocoderNode.disconnect();
        soundSource.disconnect();
        soundSource.connect(audioCtx.destination);
        soundSource.connect(analyser);
      }
    }
  }






  function paintWave(inBuffer){

    // Scale of wave
    let stepW = 0.3*canvas.width/inBuffer.length;
    let stepH = 100;
    // Axis
    canvasCtx.lineWidth = "1";
    canvasCtx.strokeStyle = "rgba(255,255,255, 0.5)";
    canvasCtx.beginPath(); // X axis
    canvasCtx.moveTo(0, 0);
    canvasCtx.lineTo(1.1*inBuffer.length*stepW, 0);
    canvasCtx.stroke();
    canvasCtx.beginPath(); // Y axis
    canvasCtx.moveTo(0, stepH*1.1);
    canvasCtx.lineTo(0, -stepH*1.1);
    canvasCtx.stroke();

    if (!playing)
      return;

    // Wave signal
    canvasCtx.beginPath();
    canvasCtx.lineWidth = "1";
    canvasCtx.strokeStyle = "white";
    canvasCtx.moveTo(0, 0);
    for (let i = 0; i< inBuffer.length; i++){
      canvasCtx.lineTo(i*stepW, inBuffer[i]*stepH);
    }
    canvasCtx.stroke();
  }



  // Paint loop
  function draw(dt)
  {
    // Clear canvas
    canvasCtx.clearRect(0,0, canvas.width, canvas.height);

    // Get wave buffer
    if (playing)
      analyser.getFloatTimeDomainData(waveBuffer);

    // Paint wave signal
    let wposW = 100;
    let wposH = 100;
    canvasCtx.translate(wposW,wposH);
    paintWave(waveBuffer);
    canvasCtx.translate(-wposW,-wposH);

    // Paint AudioworkletBuffer
    if (workletBuffer !== null && workletBuffer !== undefined){
      wposW = 100;
      wposH = 500;
      canvasCtx.translate(wposW,wposH);
      paintWave(workletBuffer);
      canvasCtx.translate(-wposW,-wposH);

      wposW = canvas.width/2;
      wposH = 500;
      canvasCtx.translate(wposW,wposH);
      paintWave(workletBuffer2);
      canvasCtx.translate(-wposW,-wposH);


      wposW = canvas.width/2;
      wposH = 100;
      canvasCtx.translate(wposW,wposH);
      paintWave(pBlock);
      paintWave(oBlock);
      canvasCtx.translate(-wposW,-wposH);
    }


      requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);








  canvas.ondragover = function(e) {
    e.preventDefault()
    e.stopPropagation()
  }

  canvas.ondrop = function(e) {
      e.preventDefault()
      e.stopPropagation()

      var files = e.dataTransfer.files;
      // Load files
      var count = 0;
      for (var i = 0; i < files.length; i++) {
          var file = files[i];

          var reader = new FileReader();
          reader.fname = file.name;

          // Load files 
          reader.addEventListener('load', function(e) {
              var data = e.target.result;
            var fileName = this.fname;
            var ss = fileName.split(".");
            var extension = ss[ss.length - 1];
            var sName = ss[0];

            // For audio files
            if (extension == "wav"){
                audioCtx.decodeAudioData(data, function(buffer) {
                  // Define audio buffer
                  soundBuffer[sName] = buffer;
                  // Add element to DOM list
                  selectAudio.add(new Option(sName, sName, false,sName));
                });
          }

          // Count the number of files loaded
          count ++;
          if (count == files.length){
            // All files loaded
            console.log(count + ' files dropped', 'success', 3);
            
          }
          })
          reader.readAsArrayBuffer(file);
      }
  }



  // Resize canvas
  window.onresize = function() {
    canvas.width = document.body.clientWidth;
    canvas.height = document.body.clientHeight;
  }

}




window.onload = () => {
  startDemo();
}