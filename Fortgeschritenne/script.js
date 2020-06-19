// The main global scope
console.log("v0.20");


startDemo = () => {
  // Start AudioContext
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioContext({sampleRate:12000});
  // AudioContext nodes
  // Analyser node - Gets the wave buffer (and fft) on the main thread
  const analyser = audioCtx.createAnalyser();
  analyser.smoothingTimeConstant = 0.0;
  analyser.fftSize = 2048;
  // Sound source node (buffer source)
  let soundSource;
  let streamSource;
  // Stores the buffers of the dragged audio files
  let soundBuffer = {};

  // initialize sound source for files
  soundSource = audioCtx.createBufferSource();

  // ask user to allow mic input
  navigator.mediaDevices.getUserMedia({audio: true})
    .then(function(stream) {
      streamSource = audioCtx.createMediaStreamSource(stream);
    });

  // Log AudioContext sampling rate
  console.log("Sampling rate: " + audioCtx.sampleRate + "Hz.");

  // Create and load AudioWorklet node
  let vocoderNode = null;
  audioCtx.audioWorklet.addModule('vocoder.js').then(() => {
    console.log("Vocoder audioworklet loaded...");
    vocoderNode = new AudioWorkletNode(audioCtx, 'vocoder');

    // Receive message from AudioWorklet Node
    vocoderNode.port.onmessage = (e) => {
      // Get information at every frame
      if (e.data.buffer !== undefined){
        workletBuffer = e.data.buffer;
        workletBuffer2 = e.data.bufferPair;
        pBlock = e.data.pairBlock;
        oBlock = e.data.oddBlock;
        lpcCoeff = e.data.lpcCoeff;
        kCoeff = e.data.kCoeff;
	      blockRMS = e.data.blockRMS;
      }
      // Get information every second
      if (e.data.message == 'Update'){
        console.log(e.data);
      }
    };
  });




  // App control variables
  let playing = false;



  // Variables for displaying information on canvas
  // Wave buffer for painting
  const waveBuffer = new Float32Array(analyser.fftSize);
  let workletBuffer = null;
  let workletBuffer2 = null;
  let pBlock = null;
  let oBlock = null;
  let lpcCoeff = null;
  let kCoeff = null;



  // DOM elements
  const playButton = document.getElementById("playButton");
  const inputButton = document.getElementById("inputButton");
  const vocoderButton = document.getElementById("vocoderButton");
  const selSoundContainer = document.getElementById("selSoundContainer");
  const selectAudioList = document.getElementById("selectAudio");
  const canvas = document.getElementById("myCanvas");
  const canvasCtx = canvas.getContext("2d");
  // Resize canvas
  canvas.width = document.body.clientWidth;
  canvas.height = document.body.clientHeight;





  // Button actions
  // Play/Pause
  playButton.onclick = () => {
    disconnect_all();



    if (!playing) {
      // check if context is in suspended state (autoplay policy)
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      soundSource = audioCtx.createBufferSource();
      soundSource.buffer = soundBuffer[selectAudioList.value];
      connect_source();

      soundSource.start();
      console.log('start');
      playing = true;
      playButton.innerText = 'Pause Sound';
    } else {
      soundSource.stop();
      console.log('stop')
      playing = false;
      playButton.innerText = 'Play Sound';
    }
  }




  // Switch microphone/file input
  inputButton.onclick = () => {
    disconnect_all();

    if (inputButton.checked) {

      // hide list of audio
      selSoundContainer.style.visibility = 'hidden';

    } else {

      // show list of audio
      selSoundContainer.style.visibility = 'visible';
      //soundSource.buffer = soundBuffer[selectAudioList.value];

    }
      if (playing){
	connect_source();
      }
  }


  vocoderButton.onclick = () => {
    disconnect_all();
    if (playing){
      connect_source();
    }
  }

  function connect_streamSource(){
    if (vocoderButton.checked) {
      streamSource.connect(vocoderNode).connect(audioCtx.destination);
      streamSource.connect(vocoderNode).connect(analyser);
    } else {
      streamSource.connect(audioCtx.destination);
      streamSource.connect(analyser);
    }
  }

  function connect_fileSource(){
    if (vocoderButton.checked) {
      soundSource.connect(vocoderNode).connect(audioCtx.destination);
      soundSource.connect(vocoderNode).connect(analyser);
    } else {
      soundSource.connect(audioCtx.destination);
      soundSource.connect(analyser);

    }
  }

  function connect_source(){
    if (inputButton.checked){
      connect_streamSource();
    } else {
      connect_fileSource();
    }
  }


  function disconnect_all(){
    streamSource.disconnect();
    soundSource.disconnect();
    vocoderNode.disconnect();
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


  function drawRMSCircle(blockRMS){
    let radius = 1000 * blockRMS;

    canvasCtx.beginPath();
    canvasCtx.lineWidth = "1";
    canvasCtx.strokeStyle = "white";
    canvasCtx.arc(0, 0, radius, 0, 2*Math.PI);
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
      // Plot pairBuffer
      wposW = 100;
      wposH = 500;
      canvasCtx.translate(wposW,wposH);
      paintWave(workletBuffer);
      canvasCtx.translate(-wposW,-wposH);

      // Plot oddBuffer
      wposW = canvas.width/2;
      wposH = 500;
      canvasCtx.translate(wposW,wposH);
      paintWave(workletBuffer2);
      canvasCtx.translate(-wposW,-wposH);

      // Plot block
      wposW = canvas.width/2;
      wposH = 100;
      canvasCtx.translate(wposW,wposH);
      paintWave(pBlock);
      paintWave(oBlock);
      canvasCtx.translate(-wposW,-wposH);

      // Plot LPC coefficients
      if (lpcCoeff !== undefined){
        wposW = canvas.width/2;
        wposH = canvas.height/3;
        canvasCtx.translate(wposW,wposH);
        paintWave(lpcCoeff);
        paintWave(lpcCoeff);
        canvasCtx.translate(-wposW,-wposH);
      }

      // Plot tube areas from speech (wakita)
      //https://www.ece.ucsb.edu/Faculty/Rabiner/ece259/digital%20speech%20processing%20course/lectures_new/Lecture%2014_winter_2012.pdf
      if (kCoeff !== null){
        // Pre-emphasis?
        // Calculate A
        let a = [1];
        canvasCtx.fillStyle = "white";

        wposW = canvas.width/3;
        wposH = canvas.height/3;
        canvasCtx.translate(wposW,wposH);
        for (let i = 1; i<kCoeff.length; i++){
          a[i] = a[i-1]*(1-kCoeff[i-1])/(1+kCoeff[i-1]);
          canvasCtx.fillRect(i*20, 0, 20, a[i-1]*20)
        }
        canvasCtx.fillRect((kCoeff.length)*20,0 , 20, a[kCoeff.length-1]*20);
        canvasCtx.translate(-wposW,-wposH);
      }

      // visualize block RMS as circle with varying radius
      if (blockRMS != undefined){
	      wposW = canvas.width/4;
	      wposH = canvas.height/3;
        canvasCtx.translate(wposW,wposH);
	      drawRMSCircle(blockRMS);
	      canvasCtx.translate(-wposW,-wposH);
      }
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
            if (extension == "wav" || extension == 'mp3'){
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
