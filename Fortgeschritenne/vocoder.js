/* Vocoder AudioWorklet Processor

 - Overlap and Add:
  -- Make frames (current and previous) out of the blocks of the 128 samples
  -- Add frames to produce output


*/
class Vocoder extends AudioWorkletProcessor {

  // currentFrame, currentTime and sampleRate are global variables of AudioWorkletProcessor
  // currentFrame is does not give the same result as counting iterations (this._countBlock)
  constructor() {
    super();
    // Initialize parameters
    this.init(0.02);
    // Process message
    this.port.onmessage = this.handleMessage_.bind(this);
  }

  // input: Frame duration in seconds
  init(frameDuration){
    // Initialize variables

    // Frame information
    // Frame duration (e.g., 0.02 s)
    const fSize = frameDuration*sampleRate;
    // Make the framesize multiple of 128 (audio render block size)
    this._frameSize = 128*Math.round(fSize/128); // Frame duration = this._frameSize/sampleRate;

    this._numBlocksInFrame = this._frameSize/128; // 8 at 48kHz and 20ms window
    // Predefined 50% overlap
    this._numBlocksOverlap = Math.floor(this._numBlocksInFrame/2); // 4 at 48kHz and 20ms window

    // Define frame buffers
    this._oddBuffer = new Float32Array(this._frameSize); // previous and current are reused
    this._pairBuffer = new Float32Array(this._frameSize); //  previous and current are reused

    // We want to reuse the two buffers. This part is a bit complicated and requires a detailed description
    // Finding the block indices that belong to each buffer is complicated
    // for buffers with an odd num of blocks.
    // Instead of using full blocks, half blocks could be used. This also adds
    // another layer of complexity, so not much to gain...
    // Module denominator to compute the block index
    this._modIndexBuffer = this._numBlocksInFrame + this._numBlocksInFrame % 2; // Adds 1 to numBlocksInFrame if it's odd, otherwise adds 0

    // Count blocks
    this._countBlock = 0;

    // Computed buffers
    this._oddSynthBuffer = new Float32Array(this._frameSize);
    this._pairSynthBuffer = new Float32Array(this._frameSize);

    console.log("Frame size: " + this._frameSize +
          ". Set frame length: " + this._frameSize/sampleRate + " seconds" +
          ". Desired frame length: " + frameDuration + " seconds" +
          ". Blocks per frame: " + this._numBlocksInFrame +
          ". Blocks overlap: " + this._numBlocksOverlap);




    // LCP variables
    // LPC filter coefficients
    this._lpcCoeff = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    // LPC k coefficients
    this._kCoeff = [];
    // Filter samples
    this._prevY = [];
    // Quantization
    this._quantOpt = false;
    this._quantBits = 2;
    // Reverse K's
    this._reverseKOpt = false;

    // resampling before analysis
    this._resamplingFactor = 1; // 0.5 is funny chipmunk voice, 1 is neutral
    this.updateResampler(this._resamplingFactor);

    // Synthesis
    // Create impulse signal
    this._impulseSignal = new Float32Array(this._frameSize);

    // autocorrelation indices for fundamental frequency estimation
    this._lowerACFBound = Math.floor(sampleRate / 200); // 200 Hz upper frequency limit -> lower limit for periodicity in samples
    this._upperACFBound = Math.ceil(sampleRate / 70); // 70 Hz lower frequency limit -> upper limit

    // excitation variables
    this._tonalConfidence = 0;
    this._confidenceTonalThreshold = 0.1;
    this._periodFactor = 1;

    // buffer for fundamental period estimation
    this._fundPeriodLen = this._upperACFBound - this._lowerACFBound;
    this._fundPeriodBuffer = [];




    // Debug
    // Timer to give updates to the main thread
    this._lastUpdate = currentTime;
    // Block info
    this._block1 = new Float32Array(128);
    this._block2 = new Float32Array(128);

  }


  // Receive messages from main thread
  handleMessage_(e){

    switch (e.data.id) {

    case "quantization":
      this._quantOpt = e.data.quantOpt;
      this._quantBits = e.data.quantBits;
      break;

    case "reverseK":
      this._reverseKOpt = e.data.reverseKOpt;
      break;

    case "resampling":
      this._resamplingFactor = e.data.resampFactor;
      this.updateResampler(this._resamplingFactor);
      break;

    default: // any unknown ID: log the message ID
      console.log("unknown message received:")
      console.log(e.data.id)
    }
  }

  updateResampler(factor) {
    // this function should be called on every change of the resampling factor for the vocal tract length
    const {resampFiltB, resampFiltA} = this.designAntiAliasLowpass(factor); // B transversal, A recursive coefficients
    this._resampFiltB = resampFiltB;
    this._resampFiltA = resampFiltA;
  }


  designAntiAliasLowpass(resamplingFactor){
    if (resamplingFactor >= 1){
      // 'neutral' filter that does nothing
      var resampFiltB = [1, 0, 0];
      var resampFiltA = [1, 0, 0];

    } else {
      // parametric lowpass filter design taken from RBJ's audio EQ cookbook. also helpful: http://aikelab.net/filter/
      const omega = Math.PI * resamplingFactor; // w = 2*pi*f/fs
      const Q = 0.95; // almost no resonance peak since we dont want to influence formant structure
      const sin_om = Math.sin(omega);
      const cos_om = Math.cos(omega);
      const alpha = sin_om / (2.0 * Q);

      const a0 = 1.0 + alpha; // only used for scaling, set to 1 later
      const a1 = -2.0 * cos_om / a0;
      const a2 = (1.0 - alpha) / a0;
      const b0 = (1.0 - cos_om) / 2.0 / a0;
      const b1 = (1.0 - cos_om) / a0;
      const b2 = (1.0 - cos_om) / 2.0 / a0;

      var resampFiltB = [b0, b1, b2];
      var resampFiltA = [1, a1, a2];
    }

    return {resampFiltB: resampFiltB,
	    resampFiltA: resampFiltA};
  }


  createTonalExcitation(periodSamples, errorRMS){

    // first write zeros
    for (let i=0; i<this._frameSize; i++) {
	this._impulseSignal[i] = 0;
    }

    // now create pulse train with given period
    for (let i=this._pulseOffset; i<this._frameSize; i+=periodSamples){
	this._impulseSignal[i] = 1;
    }

    // compute RMS of pulse train
    this._impulseSignalRMS = this.blockRMS(this._impulseSignal);

    let lastIndex = 0;

    // scale each impulse to desired RMS
    for (let i=this._pulseOffset; i<this._frameSize; i+=periodSamples){
      this._impulseSignal[i] = errorRMS / this._impulseSignalRMS;
      lastIndex = i;
    }
    this._pulseOffset = lastIndex + periodSamples - this._frameSize;

    return this._impulseSignal;
  }

  createNoiseExcitation(errorRMS){

    let r1 = 0;
    let r2 = 0;

    for (let i=0; i<this._frameSize; i=i+2) {
      // draw two independent samples from unit distribution in interval [0,1]
      r1 = Math.random();
      r2 = Math.random();

      // perform the Box-Muller transform:
      // the normal distributed value is given by the angle (cos/sin part) randomly set by first sample
      // and scaled via the second sample -> result standard normally distributed values
      // we get two independent samples from this!
      this._impulseSignal[i] = Math.sqrt(-2.0 * Math.log(r1)) * Math.cos(2.0 * Math.PI * r2);
      this._impulseSignal[i+1] = Math.sqrt(-2.0 * Math.log(r1)) * Math.sin(2.0 * Math.PI * r2);
    }

        // compute RMS of pulse train
    this._impulseSignalRMS = this.blockRMS(this._impulseSignal);
    const scalingFactor = errorRMS * this._impulseSignalRMS;

    // scale each impulse to desired RMS
    for (let i=0; i<this._frameSize; i++){
      this._impulseSignal[i] = this._impulseSignal[i] * scalingFactor;
    }

    return this._impulseSignal;
  }


  // Fill buffers
  processBlock(outBlock, inputBlock) {

    /*
    Example of frames of made of 5 blocks
      O O O O O -- blockPair
            0 0 0 0 0 -- blockOdd
                  O O O O O -- blockPair
                        0 0 0 0 0

      0 1 2 3 4 - time, i.e. block count (blockPair)
            3 4 5 6 7 - time, i.e. block count (blockOdd)
            0 1 2 3 4 - ind blockOdd
    */
    // Get block index for the pair buffer
    let indBlockPair = this._countBlock % this._modIndexBuffer;
    // Assign block to the pair buffer
    if (indBlockPair <= this._numBlocksInFrame) // Only applies for odd numBlocksInFrame (a block is assigned to a single buffer only in the middle of the frame)
      this._pairBuffer.set(inputBlock, 128*indBlockPair);

    // Get block index for the odd buffer
    let indBlockOdd = (indBlockPair + this._modIndexBuffer/2) % this._modIndexBuffer;
    // Assign block to the buffer
    if (indBlockOdd <= this._numBlocksInFrame) // Only applies for odd numBlocksInFrame (a block is assigned to a single buffer only in the middle of the frame)
      this._oddBuffer.set(inputBlock, 128*indBlockOdd);

    // Get the output block from the mix of pairSynthBuff and oddSynthBuff
    this.synthesizeOutputBlock(outBlock);


    // Synthesize buffers -- Do modifications on the buffers (vocoder goes here)
    // A synth buffer is only modified when a buffer is filled with new blocks
    this.synthesizeBuffer(indBlockPair, this._pairBuffer, this._pairSynthBuffer);
    this.synthesizeBuffer(indBlockOdd, this._oddBuffer, this._oddSynthBuffer);
  }




  // Synthesize buffer
  synthesizeBuffer(indBlock, buffer, synthBuffer) {
    // Only synthesize when it is filled
    if (indBlock == this._numBlocksInFrame - 1){

      //bypass(buffer, synthBuffer);
      //ema(buffer, synthBuffer);

      synthBuffer = this.LPCprocessing(buffer, synthBuffer);

    }
  }

  resampleLinear(inBuffer, origFramesize, resamplingFactor) {

    // first filter with biquad lowpass at the new nyquist rate
    const filteredBuffer = this.filterBiquad(this._resampFiltB, this._resampFiltA, inBuffer);

    let newFramesize = Math.round(origFramesize * resamplingFactor);
    if (resamplingFactor > 1){
      newFramesize -= 1; // this is a cheap workaround but it doesnt matter so much for LPC analysis, right?
    }
    let newBuffer = new Float32Array(newFramesize);



    for (let x_new=0; x_new<newFramesize; x_new++) {

      // new steps are integer indices, old steps are related to this via the inverse resampling factor
      let oldStep = x_new / resamplingFactor;

      // use the neighbouring integer indices of the old samplerate
      // (if identical the sample should be used twice and the result should be equal to this value)
      let l_idx = Math.floor(oldStep);
      let r_idx = Math.ceil(oldStep);

      if (l_idx === r_idx){
	newBuffer[x_new] = filteredBuffer[l_idx];
      } else{
	let x_left = l_idx * resamplingFactor;
	let x_right = r_idx * resamplingFactor;
	let y_left = filteredBuffer[l_idx];
	let y_right = filteredBuffer[r_idx];

	newBuffer[x_new] = (y_left * (x_right - x_new) + y_right * (x_new - x_left)) / (x_right - x_left);
      }
    }

    return newBuffer;
  }


  filterBiquad(coeffB, coeffA, inBuffer){ // TODO: probably should have used BiquadFilterNode from the Web Audio API (they use the same formulas as RBJ!)

    // create buffer for output and temp values saved inbetween
    let outBuffer = new Float32Array(inBuffer.length);
    let xBuff = [0, 0, 0];
    let yBuff = [0, 0];

    for (let i=0; i<inBuffer.length; i++){


      // update x-Buffer
      xBuff.unshift(inBuffer[i]); // add new entry to the beginning
      xBuff.pop(); // remove last entry

      // compute one sample of the output
      outBuffer[i] = coeffB[0] * xBuff[0] + coeffB[1] * xBuff[1] + coeffB[2] * xBuff[2] - coeffA[1] * yBuff[0] - coeffA[2] * yBuff[1];

      // update y-Buffer
      yBuff.unshift(outBuffer[i]);
      yBuff.pop();

    }
    return outBuffer;
  }

  LPCprocessing(inBuffer, outBuffer){

    let M = 12;

    if (this._resamplingFactor != 1) {
      this._resampBuffer = this.resampleLinear(inBuffer, this._frameSize, this._resamplingFactor);
      this._lpcCoeff = this.LPCcoeff(this._resampBuffer, M);
    } else {
      // Getting the a coefficients and k coefficients
      // The a coefficients are used for the filter
      this._lpcCoeff = this.LPCcoeff(inBuffer, M);
    }
    // Quantazie LPC coefficients if selected
    if (this._quantOpt)
      this._lpcCoeff = this.quantizeLPC(this._lpcCoeff, this._kCoeff, this._quantBits);

    // Reverse K's
    if (this._reverseKOpt)
        this._lpcCoeff = this.reverseKCoeff(this._lpcCoeff, this._kCoeff);



    let errorBuffer = new Float32Array(this._frameSize)
    // compute error signal and its RMS
    let in_idx = 0;

    // Iterate for each sample. O(fSize*M)
    for (let i = 0; i< inBuffer.length; i++){
      for (let j = 0; j<M+1; j++){
	in_idx = i + j; // i don't really know what should happen in this case, add zeros?
	  if (in_idx >= inBuffer.length){
	    in_idx -= inBuffer.length;
	  }
          errorBuffer[i] += inBuffer[in_idx]*this._lpcCoeff[j]; // a[0]*x[0] + a[1]*x[n-1] + a[2]*x[n-2] ... + a[M]*x[n-M]
      }
    }


    this._rms = this.blockRMS(errorBuffer);

    // longer vocal tract -> less fundamental period
    let periodSamples = Math.round(this._periodFactor * this.autocorrPeriod(inBuffer));

    this._fundFreq = sampleRate / periodSamples;

    // decide whether to use periodic or noise excitation for the synthesis
    if (this._tonalConfidence > this._confidenceTonalThreshold) {
      this.createTonalExcitation(periodSamples, this._rms);
    } else {
      this.createNoiseExcitation(this._rms);
    } // both write on this._impulseSignal

    // Filter
    // y[n] = b[0]*x[n]/a[0] - a[1]*y[n-1] - a[2]*y[n-2] ... - a[M]*y[n-M]
    //y[n] = x[n] - a[1]*y[n-1] - a[2]*y[n-2] ... - a[M]*y[n-M]
    let y_prev = this._prevY;// As many zeros as M;
    for (let i=0; i< M; i++){
      y_prev[i] = 0;
    }

    // Iterate for each sample. O(fSize*M)
    for (let i = 0; i< inBuffer.length; i++){
      outBuffer[i] = this._impulseSignal[i]; // x[n]
      for (let j = 1; j<M+1; j++){
        outBuffer[i] -= y_prev[M-j]*this._lpcCoeff[j]; // - a[1]*y[n-1] - a[2]*y[n-2] ... - a[M]*y[n-M]
      }
      y_prev.shift(1); // Deletes first element of array
      y_prev.push(outBuffer[i]); // Adds a new element at the end of the array

    }

    return outBuffer;

  }



  autocorrPeriod(inBuffer) {

    for (let i=0; i<this._fundPeriodLen; i++) {
      this._fundPeriodBuffer[i] = 0;
    }

    for (let shift = this._lowerACFBound; shift<this._upperACFBound; shift++){
      this._fundPeriodBuffer[shift-this._lowerACFBound] = this.autoCorr(inBuffer, shift);
    }
    // partially stolen from https://stackoverflow.com/questions/11301438/return-index-of-greatest-value-in-an-array
    let maxIdx = this._lowerACFBound + this._fundPeriodBuffer.indexOf(Math.max(...this._fundPeriodBuffer));

    // compute the "confidence" that a block even has tonal excitation (for switching to noise excitation if not)
    this._tonalConfidence = this.autoCorr(inBuffer, maxIdx) / this.autoCorr(inBuffer, 0);

    return maxIdx;
  }


  blockRMS(inBuffer) {
    let squaredSum = 0;
    for (let i = 0; i < inBuffer.length; i++){
      squaredSum += inBuffer[i] * inBuffer[i];
    }
    let meanValue = squaredSum / inBuffer.length;
    let rmsValue = Math.sqrt(meanValue);

    return rmsValue;
  }

  // Based on Levinson proposal in:
  /*Dutoit, T., 2004, May. Unusual teaching short-cuts to the Levinson
  and lattice algorithms. In 2004 IEEE International Conference on Acoustics,
  Speech, and Signal Processing (Vol. 5, pp. V-1029). IEEE.
  */
  LPCcoeff(inBuffer, M){
    // Levinson's method
    //let M = 12;
    // Autocorrelation values
    let phi = []; // Garbage collector
    for (let i = 0; i<M+1; i++){
      phi[i] = this.autoCorr(inBuffer, i);
    }

    // M = 1
    let a1_m = -phi[1] / phi[0];

    this._kCoeff[0] = a1_m;


    // Iterate to calculate coefficients
    let coeff = [1, a1_m];
    let tempCoeff = [1, a1_m];

    let mu = 0;
    let alpha = 0;
    let k = 0;
    for (let m = 0; m < M-1; m++){
        mu = 0;
        alpha = 0;
        // Calculate mu and alpha
        for (let i = 0; i<m+2; i++){
            mu += coeff[i]*phi[m+2-i];
            alpha += coeff[i]*phi[i];
        }
        k = - mu / alpha;

        this._kCoeff[m+1] = k;
        // Calculate new coefficients
        coeff[m+2] = 0;
        for (let i = 1; i<m+3; i++){
            tempCoeff[i] = coeff[i] + coeff[m+2-i]*k;
        }
        coeff = tempCoeff.slice();
    }

    return coeff;
  }


  // Quantize K coeficients
  // TODO: it gives the same result as matlab, but there are errors at lower bit rates??
  quantizeLPC(lpcCoeff, kCoeff, numBits){
    let M = lpcCoeff.length-1;
    // Quantize Ks
    for (let i = 0; i< M; i++){
      kCoeff[i] = this.quantizeK(kCoeff[i], numBits);
    }
    // recalculate LPC
    return this.recalculateLPC(lpcCoeff, kCoeff);

  }

  // Reverse K coefficients
  reverseKCoeff(lpcCoeff, kCoeff){
    kCoeff.reverse();
    // Recalculate K's
    return this.recalculateLPC(lpcCoeff, kCoeff);
  }

  recalculateLPC(lpcCoeff, kCoeff){
    let M = lpcCoeff.length-1;
    // Recalulate coefficients
    let qLpcCoeff = [1]; // Garbage collector
    for (let m = 0; m < M; m++){
      lpcCoeff[m+1] = 0;
      for (let i = 1; i<m+2; i++){
        qLpcCoeff[i] = lpcCoeff[i] + kCoeff[m]*lpcCoeff[m+1-i];
      }
      lpcCoeff = qLpcCoeff.slice();
    }
    return lpcCoeff;
  }



  // Quantize K's
  quantizeK(k, numBits){
    let steps = Math.pow(2, numBits)-1; // e.g. 4 steps -1 to 1 --> 0 -- 1 * 3
    let qK = ((k+1)/2)*steps; // Transform to range 0 to (2^bits -1) e.g. 0 -- 3
    qK = Math.round(qK)/steps; // Quantize and scale down (range 0 to 1) e.g. (0 1 2 3 )/3 = 0 to 1
    qK = qK*2 - 1; // Transform to range -1 to 1

    return qK;
  }

  // Autocorrelation function
  autoCorr(buffer, delay){
    let value = 0;
    for (let i = 0; i< buffer.length - delay; i++){
      // Because autocorrelation is symmetric, I use "i + delay", not "i - delay"
      value += buffer[i] * buffer[(i + delay)];
    }
    return value;
  }







  // Bypass. Checks for overlap and add artifacts
  bypass(inBuffer, outBuffer){
    for (let i = 0; i < buffer.length; i++){
        outBuffer[i] = inBuffer[i];
      }
  }

  // Exponential Moving Average filter. Needs last sample of the previous synth buffer
  ema (inBuffer, outBuffer){
    for (let i = 0; i < buffer.length; i++){
      // Smooth, EMA
      if (i == 0){// Skip first sample (Or take it from previous buffer?)
        outBuffer[i] = inBuffer[i];
      } else {
        outBuffer[i] = inBuffer[i]*0.01 + outBuffer[i-1]*0.99;
       }
    }
  }






  // Windowing and mixing odd and pair buffers
  synthesizeOutputBlock(outBlock) {

    // Get block index for pair and odd buffers
    /*
    We want to get X: the current block to mix
     0 0 0 X 0        --> Pair block
           X O O O O  --> Odd block
     o o o x ...      --> Synthesized block (outBlock)
    */
    let indBlockPair = this._countBlock % this._modIndexBuffer;
    let indBlockOdd = (indBlockPair + this._modIndexBuffer/2) % this._modIndexBuffer;

    // TODO: Right now this only works for 50% overlap and an even number of blocks per frame.
    // More modifications would be necessary to include less than 50% overlap and an odd number of blocks per frame. Right now an amplitude modulation would appear for an odd number of blocks per frame (to be tested - AM from 1 to 0.5).

    // Iterate over the corresponding block of the synthesized buffers
    for (let i = 0; i<outBlock.length; i++){
      let indPair = i + 128*indBlockPair;
      let indOdd = i + 128*indBlockOdd;

      // Hanning window
      // Use hanning window sin^2(pi*n/N)
      let hannPairBValue = Math.pow(Math.sin(Math.PI*indPair/this._frameSize), 2);
      let hannOddBValue = Math.pow(Math.sin(Math.PI*indOdd/this._frameSize), 2);
      // Hanning windowed frames addition
      outBlock[i] = hannPairBValue*this._pairSynthBuffer[indPair] + hannOddBValue*this._oddSynthBuffer[indOdd];



      // Debugging
      //outBlock[i] = this._pairBuffer[i];//this._pairSynthBuffer[indPair];//0.5*this._pairSynthBuffer[indPair] + 0.5*this._oddSynthBuffer[indOdd];
      this._block1[i] = this._pairSynthBuffer[indPair];
      this._block2[i] = this._oddSynthBuffer[indOdd];
    }

  }



  // Main function
  process(inputs, outputs) {
    // By default, the node has single input and output.
    const input = inputs[0];
    const output = outputs[0];

    for (let channel = 0; channel < output.length; ++channel) {

      const inputChannel = input[channel];
      const outputChannel = output[channel];
      //for (let i = 0; i < inputChannel.length; ++i){
        // Distortion
        //outputChannel[i] = inputChannel[i];//Math.max(-1, Math.min(1,inputChannel[i]*5)) ; // Amplify and clamp
      //}

      // Process block
      this.processBlock(outputChannel, inputChannel);
    }

    this._countBlock++;


    // Send to main thread the buffers every frame
    if (this._countBlock  % this._modIndexBuffer == this._numBlocksInFrame-1){
      this.port.postMessage({
        buffer: this._oddSynthBuffer.slice(),
        bufferPair: this._pairSynthBuffer.slice(),
        pairBlock: this._block1.slice(),
        oddBlock: this._block2.slice(),
        lpcCoeff: this._lpcCoeff.slice(),
        kCoeff: this._kCoeff.slice(),
	blockRMS: this._rms,
	fundamentalFrequencyHz: this._fundFreq,
	tractStretch: this._resamplingFactor,
      });

    }


    // Send data
    // Post a message to the node for every 1 second.
    if (currentTime - this._lastUpdate > 1.0) {
      this.port.postMessage({
        message: 'Update',
        contextTimestamp: currentTime,
        currentFrame: currentFrame,
        currentBlock: this._countBlock,
        buffer: this._oddSynthBuffer.slice(),
        bufferPair: this._pairSynthBuffer.slice(),
        pairBlock: this._block1.slice(),
        oddBlock: this._block2.slice(),
        lpcCoeff: this._lpcCoeff.slice(),
        kCoeff: this._kCoeff.slice(),
	blockRMS: this._rms,
	fundamentalFrequencyHz: this._fundFreq,
	tractStretch: this._resamplingFactor,
      });
      this._lastUpdate = currentTime;
    }


    return true;
  }


}

registerProcessor('vocoder', Vocoder);
