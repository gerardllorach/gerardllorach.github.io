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
    this._lastUpdate = currentTime;

    // Frame size (20ms)
    const fSize = 0.02*sampleRate; 
    // Make the framesize multiple of 128 (audio render block size)
    this._frameSize = 128*Math.round(fSize/128); // Frame duration = this._frameSize/sampleRate;
    console.log("Frame size: " + this._frameSize);
    this._numBlocksInFrame = this._frameSize/128; // 8 at 48kHz and 20ms window
    // 50% overlap
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
    this._modIndexBuffer = this._numBlocksInFrame + Math.ceil(this._numBlocksInFrame/2) - Math.floor(this._numBlocksInFrame/2); // Adds 1 to numBlocksInFrame if it's odd, otherwise adds 0

    // Count blocks
    this._countBlock = 0;


    // Computed buffers
    this._oddSynthBuffer = new Float32Array(this._frameSize);
    this._pairSynthBuffer = new Float32Array(this._frameSize);

    // Block info
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
    let indBlockPair = this._countBlock % this._modIndexBuffer;
    if (indBlockPair <= this._numBlocksInFrame) // Only applies for odd numBlocksInFrame (a block is assigned to a single buffer only in the middle of the frame)
      this._pairBuffer.set(inputBlock, 128*indBlockPair); 


    let indBlockOdd = (indBlockPair + this._modIndexBuffer/2) % this._modIndexBuffer;
    if (indBlockOdd <= this._numBlocksInFrame) // Only applies for odd numBlocksInFrame (a block is assigned to a single buffer only in the middle of the frame)
      this._oddBuffer.set(inputBlock, 128*indBlockOdd);

    // Add: Get the output block from the mix of pairSynthBuff and oddSynthBuff
    this.synthesizeOutputBlock(outBlock, inputBlock);


    // Synthesize buffers -- Do modifications on the buffers (vocoder goes here)
    // A synth buffer is only modified when a buffer is filled with new blocks
    this.synthesizeBuffer(indBlockPair, this._pairBuffer, this._pairSynthBuffer);
    this.synthesizeBuffer(indBlockOdd, this._oddBuffer, this._oddSynthBuffer);
  }




  // Synthesize buffer
  synthesizeBuffer(indBlock, buffer, synthBuffer) {
    // Only synthesize when it is filled
    if (indBlock == this._numBlocksInFrame - 1){
      for (let i = 0; i < buffer.length; i++){
        // Do something
        //synthBuffer[i] = buffer[i];
        // Smooth
        if (i == 0){// Skip first sample
          synthBuffer[i] = buffer[i];
          continue;
        }
        // EMA
        synthBuffer[i] = buffer[i];//buffer[i]*0.01 + synthBuffer[i-1]*0.99;
      }
    }
  }


  // Windowing and mixing odd and pair buffers
  synthesizeOutputBlock(outBlock, inputBlock) {

    // Get block index for pair and odd buffers
    /*
    We want to get X: the current block to mix
     0 0 0 X 0        --> Pair block
         O X O O O    --> Odd block
     o o o x ...      --> Synthesized block (outBlock)
    */
    let indBlockPair = this._countBlock % this._modIndexBuffer;
    let indBlockOdd = (indBlockPair + this._modIndexBuffer/2) % this._modIndexBuffer;

    // Iterate over the corresponding block of the synthesized buffers
    for (let i = 0; i<outBlock.length; i++){
      let indPair = i + 128*indBlockPair;
      let indOdd = i + 128*indBlockOdd;


      //outBlock[i] = inputBlock[i];//this._pairBuffer[i];//this._pairSynthBuffer[indPair];//0.5*this._pairSynthBuffer[indPair] + 0.5*this._oddSynthBuffer[indOdd];
      this._block1[i] = this._pairSynthBuffer[indPair];
      this._block2[i] = this._oddSynthBuffer[indOdd];
      // Synth block is average of pair and odd
      //outBlock[i] = 0.5*this._pairSynthBuffer[indPair] + 0.5*this._oddSynthBuffer[indOdd];
      
      // Hanning window
      // Use hanning window sin^2(pi*n/N)
      let hannPairValue = Math.pow(Math.sin(Math.PI*indPair/this._frameSize), 2);
      let hannOddValue = Math.pow(Math.sin(Math.PI*indOdd/this._frameSize), 2);
      // Hanning windowed frames addition
      outBlock[i] = hannPairValue*this._pairSynthBuffer[indPair] + hannOddValue*this._oddSynthBuffer[indOdd];

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