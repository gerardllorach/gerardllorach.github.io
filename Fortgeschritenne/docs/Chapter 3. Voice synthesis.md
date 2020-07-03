## Chapter 3. Voice synthesis

### Voiced and unvoiced threshold
According to the vocal tract model, voiced sounds (vowels and nasal consonants, e.g., /m/ and /n/) can be synthesized with a tonal excitation signal, and unvoiced sounds (consonants) with white noise. We use the autocorrelation to detect if a sound is voiced or unvoiced. With the autocorrelation, we are checking how periodic is a signal. An explanation of the function is given in [Chapter 2](docs/Chapter%202.%20LPC%20coefficients.md). In our implementation we calculate a normalized tonal confidence. To compute it, the maximum autocorrelation value given a certain delay (`maxIdx`) is divided by the autocorrelation at zero delay:

```javascript
// "Confidence" that a block has tonal excitation (for switching to noise excitation if not)
    var tonalConfidence = this.autoCorr(inBuffer, maxIdx) / this.autoCorr(inBuffer, 0);
```
 The computation of the `maxIdx` is explained in the following section (Estimation of the fundamental frequency). After some testing, we saw that the tonal confidence ranged from 0.4 to 0.7 for voiced sounds and did not go higher than 0.3 for consonants. In our application, we let the user define manually the voiced/unvoiced threshold. This way, the user can control how if the excitation signal is tonal, noisy or a mix that depends on the threshold.

### Estimation of the fundamental frequency
In order to model tonal excitation of the vocal tract, an estimate of the fundamental frequency is required. For a fixed excitation period, the pulse-train excited synthesized signal sound very monotonous. Therefore, it leads to a qualitative improvement when for each block the fundamental frequency is estimated and the pulse-train signal is generated accordingly. This will be true mainly for tonal/voiced speech components.

An efficient way to estimate the fundamental frequency of speech is the autocorrelation method. For a periodic signal, its autocorrelation will display the same periodicity as the signal at the autocorrelation shift in samples corresponding to the period of the signal. Since for human speech, the fundamental frequency is in most cases within the range of 70 to 200 Hz, the range in which an autocorrelation peak is searched for can be limited to the range of equivalent shifts. They are computed by the following code:
```javascript
// 200 Hz upper frequency limit -> lower limit for periodicity in samples
this._lowerACFBound = Math.floor(sampleRate / 200);

// 70 Hz lower frequency limit -> upper limit
this._upperACFBound = Math.ceil(sampleRate / 70); 
```
As can be seen, the autocorrelation shifts are the inverse of the corresponding periods, and scaled to the sampling rate used in the processing scheme. Based on these boundaries we can search for the maximum of the frame-wise autocorrelation:
```javascript
for (let shift = this._lowerACFBound; shift<this._upperACFBound; shift++){
  this._fundPeriodBuffer[shift-this._lowerACFBound] = this.autoCorr(inBuffer, shift);
}
let maxIdx = this._lowerACFBound + this._fundPeriodBuffer.indexOf(Math.max(...this._fundPeriodBuffer));
```
Note that only the relevant values of the autocorrelation function need to be computed. In javascript, the `...` denotes the spread operator. This operation is necessary because the `Math.max()` function does not generalize to array type variables as well as in higher-level languages such as Matlab or Python, which natively support array operations. The expression `Math.max(...acfBuff)` is then equivalent to `Math.max(acfBuff[0], acfBuff[1], acfBuff[2] /*and so on*/)`. 

The tonal excitation is then generated based on the resulting period `periodSamples` for a single frame as follows:
```javascript
for (let i=this._pulseOffset; i<this._frameSize; i+=periodSamples){
  this._impulseSignal[i] = 1;
}
this._pulseOffset = lastIndex + periodSamples - this._frameSize;
```
The offset from the last pulse is saved in order to prevent inconsistencies inbetween block transitions, which could potentially result in clicks. Not shown is the normalization to the same RMS value per block as the error signal, so that the resulting synthesis signals has approximately the same energy per block as the original signal.
This approach is very useful in terms of processing time required, as only a part of the autocorrelation values are used within the peak search; also, within the linear prediction routine the autocorrelation is computed already. The high efficiency comes with a disadvantage however: Since it is limited to maxima of the sample-wise autocorrelation, there will a higher precision for lower frequencies (larger fundamental periods) than for high fundamental frequencies (short periods) as the grid on which the fundamental period is searched is related to the potential fundamental frequencies by inversion.

### Using the LPC coefficients to filter an excitation signal
A voiced signal can be synthesized by filtering an impulse signal and the LPC coefficients, based on the vocal tract model. The impulse signal defines the pitch and can look like this: 1, -1, 0, 0, 0, ... , 0, 0, 1, -1, 0, 0, 0... 

The Web Audio API provides a filter node, the IIRFilterNode (https://www.w3.org/TR/webaudio/#iirfilternode). Unfortunatelly, the IIR filter defines the coefficients on its creation, and it is not designed to change the coefficients dynamically. As the Web Audio API says: "Once created, the coefficients of the IIR filter cannot be changed". An option would be to create a new IIRFilterNode for every frame, but that would be an overkill for the app (probably leading to garbage collector problems?). Therefore, we implemented the filter manually.

An IIR filter with feedback coefficients (our LPC coefficients) has the form of:
```javascript
y[n] = b[0]*x[n]/a[0] - a[1]*y[n-1] - a[2]*y[n-2] ... - a[M]*y[n-M]
```
where "y[n]" is the filtered signal, "x[n]" is the input signal, "b" are the feedforward coefficients and "a" are the feedback coefficients. In our case, "b[0]" and "a[0]" are 1.
```javascript
y[n] = b[0]*x[n]/a[0] - a[1]*y[n-1] - a[2]*y[n-2] ... - a[M]*y[n-M]
```
