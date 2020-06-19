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


    // Synthesis
    // Create impulse signal
    // TODO: give more variability
    this._impulseSignal = new Float32Array(this._frameSize);
    this._pulseOffset = 0;
    //let numPulses = 8;
    //for (let i = 0; i<numPulses; i++){
    //  this._impulseSignal[i*1024/numPulses] = 1;
    //}

    // normalize impulse signal to RMS of 1
    //this._impulseSignalRMS = this.blockRMS(this._impulseSignal); // this could be circumvented since here the RMS is sqrt(framesize/numPulses), but wont hold for other excitation
    //for (let i = 0; i<1024; i++){
    //  this._impulseSignal[i] = this._impulseSignal[i] / this._impulseSignalRMS;
    //}

    // autocorrelation indices for fundamental frequency estimation
    this._lowerACFBound = Math.floor(sampleRate / 200); // 200 Hz upper frequency limit -> lower limit for periodicity in samples
    this._upperACFBound = Math.ceil(sampleRate / 70); // 70 Hz lower frequency limit -> upper limit




    // Debug
    // Timer to give updates to the main thread
    this._lastUpdate = currentTime;
    // Block info
    this._block1 = new Float32Array(128);
    this._block2 = new Float32Array(128);

  }


  handleMessage_(e){
    if (e.data.id == "quantization"){
      this._quantOpt = e.data.quantOpt;
      this._quantBits = e.data.quantBits;
    }
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



  LPCprocessing(inBuffer, outBuffer){

    let M = 12;

    // Getting the a coefficients and k coefficients
    // The a coefficients are used for the filter
    this._lpcCoeff = this.LPCcoeff(inBuffer, M);

    // Quantazie LPC coefficients if selected
    if (this._quantOpt)
      this._lpcCoeff = this.quantizeLPC(this._lpcCoeff, this._kCoeff, this._quantBits);
    

    let periodSamples = this.autocorrPeriod(inBuffer);
    this._fundFreq = sampleRate / periodSamples;


    let errorBuffer = new Float32Array(this._frameSize)
    // compute error signal and its RMS

    // Iterate for each sample. O(fSize*M)
    for (let i = 0; i< inBuffer.length; i++){
      for (let j = 0; j<M+1; j++){
	let in_idx = i + j; // i don't really know what should happen in this case, add zeros?
	  if (in_idx >= inBuffer.length){
	    in_idx -= inBuffer.length;
	  }
          errorBuffer[i] += inBuffer[in_idx]*this._lpcCoeff[j]; // a[0]*x[0] + a[1]*x[n-1] + a[2]*x[n-2] ... + a[M]*x[n-M]
      }
    }


    this._rms = this.blockRMS(errorBuffer);

    this.createTonalExcitation(periodSamples, this._rms); // writes on this._impulseSignal

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

    let phi = [];
    for (let shift = this._lowerACFBound; shift<this._upperACFBound; shift++){
      phi[shift-this._lowerACFBound] = this.autoCorr(inBuffer, shift);
    }
      // partially stolen from https://stackoverflow.com/questions/11301438/return-index-of-greatest-value-in-an-array
      let maxIdx = this._lowerACFBound + phi.indexOf(Math.max(...phi)); // apparently '...' is a JS spread operator, like '*list' in python

    //let fundFreq = sampleRate / maxIdx;

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
      });
      this._lastUpdate = currentTime;
    }


    return true;
  }


}

registerProcessor('vocoder', Vocoder);
