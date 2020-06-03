export function displayInstructions(canvas, text, onFinish){

	const ctx = canvas.getContext("2d");

	ctx.font = "30px Georgia";
	ctx.fillStyle = "white";
	ctx.fillText(text, canvas.width/2, canvas.height/2);

	onmousedown = () => {
		// Clear canvas
		ctx.clearRect(0,0, canvas.width, canvas.height);
		// Callback
		onFinish();
	};

}

export function displayDPRTResults(canvas, out){

	const ctx = canvas.getContext("2d");

	//	out.isInCirc = []; // Is inside the circle
	//out.posMouse = []; // Mouse position
	//out.posCircle= []; // Center circle
	//out.tmst = []; // Timestamps

	let countAcc = 0;

	const stepX = canvas.width / out.tmst.length;

	// isInCirc
	let locH = 100;
	ctx.beginPath();
	ctx.moveTo(0, locH);
	for (let i = 0; i< out.isInCirc.length; i++){
		// Paint line
		ctx.lineTo(stepX*i, out.isInCirc[i] ? locH-50 : locH);
		// Accuracy
		if (out.isInCirc[i])
			countAcc++;
	}
	ctx.strokeStyle = "white";
	ctx.lineWidth = 5;
	ctx.stroke();


	// Distance
	locH = 300;
	let scaleH = 0.5;
	ctx.beginPath();
	ctx.moveTo(0, locH);
	for (let i = 0; i< out.isInCirc.length; i++){
		let dist = Math.sqrt(Math.pow(out.posMouse[i][0] -  out.posCircle[i][0],2) + 
							Math.pow(out.posMouse[i][1]-  out.posCircle[i][1],2));
		ctx.lineTo(stepX*i, locH - dist*scaleH);
	}
	ctx.strokeStyle = "red";
	ctx.lineWidth = 5;
	ctx.stroke();

	return 100*countAcc/out.isInCirc.length;
}