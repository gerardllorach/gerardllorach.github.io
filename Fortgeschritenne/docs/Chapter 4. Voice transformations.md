## Voice transformations

### Manipulating the K's (lattice parameters)
When computing the LPC coefficients (aka the filter parameters), we obtain the K coefficients, also known as PARCOR coefficients. This array of k's is sufficient to recompute the LPC coefficients. We can do several modifications on the K coefficients and then recompute the modified LPC parameters, which will create some voice transformations when filtering the excitation signal.

To recompute the new LPC coefficients we implemented the following function:

```javascript
// Recalculate LPC coefficients using the new K coefficients (K coeff)
recalculateLPC(lpcCoeff, kCoeff){
  let M = lpcCoeff.length-1;
  // Recalulate coefficients
  let qLpcCoeff = [1];
  for (let m = 0; m < M; m++){
    lpcCoeff[m+1] = 0;
    for (let i = 1; i<m+2; i++){
      qLpcCoeff[i] = lpcCoeff[i] + kCoeff[m]*lpcCoeff[m+1-i];
    }
    lpcCoeff = qLpcCoeff.slice(); // Copy array values
  }
  return lpcCoeff;
}

```

#### Quantization of K's
One possible voice transformation is to quantize the K's. This is usually done to optimize voice transmission, therefore we used bits as the parameter to control the quantization steps. The number of steps equals to 2 to the power of the number of bits (2^bits). For example, using two bits leads to 4 quantization steps, and using 8 bits leads to 256 steps. In our application we created a slider that modifies the number of bits to use in the quantization in real-time.

This is the function that quantizes a given value "k" according to the number of bits. The function makes sure that the range [-1, 1] is used.

```javascript
// Quantize K's
quantizeK(k, numBits){
  let steps = Math.pow(2, numBits)-1; // e.g. 4 steps -1 to 1 --> 0 -- 1 * 3
  let qK = ((k+1)/2)*steps; // Transform to range 0 to (2^bits -1) e.g. 0 -- 3
  qK = Math.round(qK)/steps; // Quantize and scale down (range 0 to 1) e.g. (0 1 2 3 )/3 = 0 to 1
  qK = qK*2 - 1; // Transform to range -1 to 1

  return qK;
}

```


#### Reverse K's
Reversing the K's is a relatively easy operation and the voice transformation is quite effective.
