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
  }

  // Frame duration in seconds
  init(frameDuration){
    this._lastUpdate = currentTime;

    // Frame duration (e.g., 0.02 s)
    const fSize = frameDuration*sampleRate; 
    // Make the framesize multiple of 128 (audio render block size)
    this._frameSize = 128*Math.round(fSize/128); // Frame duration = this._frameSize/sampleRate;
    
    this._numBlocksInFrame = this._frameSize/128; // 8 at 48kHz and 20ms window
    // 50% overlap
    this._numBlocksOverlap = Math.floor(this._numBlocksInFrame/2); // 4 at 48kHz and 20ms window

    console.log("Frame size: " + this._frameSize + 
              ". Frame length: " + frameDuration + " seconds" +
              ". Blocks per frame: " + this._numBlocksInFrame +
              ". Blocks overlap: " + this._numBlocksOverlap);
    
    // Define frame buffers
    this._oddBuffer = new Float32Array(this._frameSize); // previous and current are reused
    this._pairBuffer = new Float32Array(this._frameSize); //  previous and current are reused

    // We want to reuse the two buffers. This part is a bit complicated and requires a detailed description
    // Finding the block indices that belong to each buffer is complicated 
    // for buffers with an odd num of blocks.
    // Instead of using full blocks, half blocks could be used. This also adds
    // another layer of complexity, so not much to gain...
    // Module denominator to compute the block index
    // this line could be done with numBlocksInFrame%2?
    this._modIndexBuffer = this._numBlocksInFrame + Math.ceil(this._numBlocksInFrame/2) - Math.floor(this._numBlocksInFrame/2); // Adds 1 to numBlocksInFrame if it's odd, otherwise adds 0

    // Count blocks
    this._countBlock = 0;

    // Computed buffers
    this._oddSynthBuffer = new Float32Array(this._frameSize);
    this._pairSynthBuffer = new Float32Array(this._frameSize);

    // LPC coefficients
    this._lpcCoeff = [];

    // Debbug: Block info
    this._block1 = new Float32Array(128);
    this._block2 = new Float32Array(128);
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

      this.LPCprocessing(buffer, synthBuffer);

      // Empty buffer?
      //buffer.fill(0);
    }
  }



  LPCprocessing(inBuffer, outBuffer){

    // TODO: compute energy (RMS) and pitch
    this._lpcCoeff = this.LPCcoeff(inBuffer);

    // Impulse signal every 128 samples. Freq = fs/128; The frequency will be doubled because of the odd/pair buffer. ~ 375/2 Hz for 48kHz
    outBuffer[0] = 1;

  }

  // Based on Levinson proposal in:
  /*Dutoit, T., 2004, May. Unusual teaching short-cuts to the Levinson 
  and lattice algorithms. In 2004 IEEE International Conference on Acoustics, 
  Speech, and Signal Processing (Vol. 5, pp. V-1029). IEEE.
  */
  LPCcoeff(inBuffer){
        // Levene's method
    let M = 12;
    // Autocorrelation values
    let phi = [];
    for (let i = 0; i<M+1; i++){
      phi[i] = this.autoCorr(inBuffer, i);
    }

    // M = 1
    let a1_m = -phi[1] / phi[0];
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
        // Calculate new coefficients
        coeff[m+2] = 0;
        for (let i = 1; i<m+3; i++){
            tempCoeff[i] = coeff[i] + coeff[m+2-i]*k;
        }
        coeff = tempCoeff.slice();
    }

    return coeff;
  }


  // Autocorrelation function helper
  autoCorr(buffer, delay){
    let value = 0;
    for (let i = 0; i< buffer.length - delay; i++){
      // Because it is symmetric, I use "i + delay", not "i - delay"
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
        synthBuffer[i] = buffer[i];
      } else {
        synthBuffer[i] = buffer[i]*0.01 + synthBuffer[i-1]*0.99;
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




  process(inputs, outputs) {
    // By default, the node has single input and output.
    const input = inputs[0];
    const output = outputs[0];

    for (let channel = 0; channel < output.length; ++channel) {

      const inputChannel = input[channel];
      const outputChannel = output[channel];
      for (let i = 0; i < inputChannel.length; ++i){
        // Distortion
        //outputChannel[i] = inputChannel[i];//Math.max(-1, Math.min(1,inputChannel[i]*5)) ; // Amplify and clamp       
      }

      // Fill buffers (overlapped)
      // Add buffers
      // Modify buffers
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
      });
      this._lastUpdate = currentTime;
      //this._oddBuffer.fill(0);
    }


    return true;
  }
}

registerProcessor('vocoder', Vocoder);