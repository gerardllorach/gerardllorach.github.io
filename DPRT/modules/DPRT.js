

// Creates the DPRT for a given canvas
/*
* Inputs
 - canvas element, revolutions per minute, audio HTML element
Outputs
 - Object with structure:
  isInCircle, posMouse, posCircle, tmst, dist
*/
export function DPRT(canvas, RPM, audioEl, onFinish){
	//const canvas = document.getElementById("myCanvas");
	const ctx = canvas.getContext("2d");

	// Ellipse variables
	let ellipseEcc = 1.8; // Ellipse eccentricity (how elliptic-circular is it)
	let ellipseRadius = 220; // Ellipse movement radius (how big is the ellipse movement)
	const phaseRand = 2*Math.PI*Math.random(); // Random start ellipse trajectory
	const rCircle = 17; // Radius circle
	//const RPM = 3.4; // Revolutions per minute

	// Inicial pause 
	let once = false; // initial pause (3 sec delay - Kemper 2009)
	const timePause = 3;
	let tt = 0; // Time running
	let time = performance.now()/1000; // Get app clock


	// Track mouse position
	let xm, ym;
	onmousemove = (e) => {xm = e.clientX; ym = e.clientY;}
	// Track ipad finger position (no multitouch)
	/*ontouchmove = (e) => {
		let touch = e.changedTouches[0];
		xm = touch.pageX;
		ym = touch.pageY;
	}*/


	// Output structure
	const out = {};
	out.isInCirc = []; // Is inside the circle
	out.posMouse = []; // Mouse position
	out.posCircle= []; // Center circle
	out.tmst = []; // Timestamps

	// Draw loop
	function draw(appClock){
		// Clear canvas
		ctx.clearRect(0,0, canvas.width, canvas.height);

		// Timer
		tt = appClock/1000 - time;

		// Initial pause (timePause)
	    if (!once){
	    	if (tt > timePause) {
	    		// START SOUND
	    		time = appClock/1000;
	    		once = true;
	    		console.log("Start running");
	    	}
	    	tt = 0;
	    }

		// Elliptic movement
		ellipseRadius = canvas.height/2 * 0.75;
		ellipseEcc = canvas.width/canvas.height;
		let x = canvas.width/2 + ellipseRadius * ellipseEcc * Math.cos(2*Math.PI*tt*RPM/60 + phaseRand);
	    let y = canvas.height/2 + ellipseRadius * Math.sin(2*Math.PI*tt*RPM/60 + phaseRand);
	    
	    // Mouse is inside or outside the circle
	    let circColor;
	    if (((xm-x)*(xm-x) + (ym-y)*(ym-y)) <= (rCircle*rCircle) )// this will set circle color based on mouse location relative to circle
	    	circColor = "rgb(0, 255, 0)"; //the mouse is inside the circle or on the perimeter,
	    else // the mouse is outside the circle
	    	circColor = "rgb(255, 255, 255)";


	    // Keeps track of whether or not mouse is in circle
	    if (once){
	    	out.isInCirc.push(((xm-x)*(xm-x) + (ym-y)*(ym-y)) <= (rCircle*rCircle));
        	out.posMouse.push([xm, ym]);
        	out.posCircle.push([x, y]);
        	out.tmst.push(tt);
	    }

	    // Paint circle
	    ctx.fillStyle = circColor;
		ctx.beginPath();
		ctx.arc(x, y, rCircle, 0, 2 * Math.PI);
		ctx.fill();  

		// End the DPRT task
	    if (tt < 10)
	    	requestAnimationFrame(draw);
	    else {
	    	console.log("DPRT finished!");
	    	onFinish();
	    }
	}
	requestAnimationFrame(draw);

	return out;
}