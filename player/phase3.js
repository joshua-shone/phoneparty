bigData = "";

function phase3(channels) {
  new function(channels) {
    console.log("Starting phase 3");

    this.imageTypes = {REAL: 0, FAKE: 1, WRONG_COLOR: 2};

    // Add callbacks
    this.onPhaseThreeMessage = function(event) {
      if (event.data == "\n") {
        this.data = JSON.parse(bigData)
        this.image_counter = 0;
        console.log(this.data);

        this.response = [];

        this.displayNextImage();
      } else {
        bigData += event.data;
        //trace("Data chunk received");
      }
      //this.data = JSON.parse(event.data);

      console.log("Adding listeners");
      document.addEventListener('touchstart', (evt) => { this.handleTouchStart(evt) }, false);
      document.addEventListener('touchmove', (evt) => {this.handleTouchMove(evt) }, false);
    }.bind(this);


    var xDown = null;
    var yDown = null;

    this.getTouches = function(evt) {
      return evt.touches ||             // browser API
        evt.originalEvent.touches; // jQuery
    }

    this.handleTouchStart = function(evt) {
      const firstTouch = this.getTouches(evt)[0];
      xDown = firstTouch.clientX;
      yDown = firstTouch.clientY;
    };

    this.handleTouchMove = function(evt) {
      if ( ! xDown || ! yDown ) {
        return;
      }

      var xUp = evt.touches[0].clientX;
      var yUp = evt.touches[0].clientY;

      var xDiff = xDown - xUp;
      var yDiff = yDown - yUp;

      if ( Math.abs( xDiff ) > Math.abs( yDiff ) ) {/*most significant*/
        if ( xDiff > 0 ) {
          console.log("left");
          this.onImageIsReal();
        } else {
          console.log("right");
          this.onImageIsFake();
        }
      } else {
        if ( yDiff > 0 ) {
          /* up swipe */
        } else {
          /* down swipe */
        }
      }
      /* reset values */
      xDown = null;
      yDown = null;
    };

    this.onKeyPress = function(event) {
      switch (event.code) {
        case "KeyA":
          this.onImageIsReal();
          break;
        case "KeyD":
          this.onImageIsFake();
          break;
        case "KeyW":
          this.onImageIsWrongColor();
          break;
      }
    }

    this.createDisplay = function() {
      //Remove existing things
      var phase1 = document.getElementById("phase1");
      if(phase1) {phase1.remove();}
      var phase2 = document.getElementById("camera-screen");
      if(phase2) {phase2.remove();}

      var container = document.createElement("div");
      document.body.append(container);
      container.id = "phase3"

      this.preview = document.createElement("div");
      container.append(this.preview);
      this.preview.style.overflow = "hidden";
      this.preview.style.height = "60%";
      this.preview.style.width = "60%";

      this.preview.image = document.createElement("img");

      this.preview.append(this.preview.image);
    }

    this.displayNextImage = function() {
      this.block_input = false;
      console.log("display next image");

      // Remove swipe classes
      this.preview.image.classList.remove("swipeLeft")
      this.preview.image.classList.remove("swipeRight")
      this.preview.image.classList.remove("swipeUp")

      var next_image = this.getNextImage();

      if(next_image == null) {
        if(!this.response_send) {
          console.log("No images left, send data to server");
          var string_data = JSON.stringify(this.response);
          channels.phaseThree.send(string_data);

          this.response_send = true;
        }
        this.preview.image.style.display = "hidden"
      } else {
        this.preview.image.src = next_image;
      }
    }

    this.getNextImage = function() {
      if (this.image_counter < this.data.length) {
        console.log("Image " + (this.image_counter+1) + " out of " + this.data.length);
        return this.data[this.image_counter++].image_blob;
      }
      return null;
    }

    this.onImageIsReal = function() {
      if(this.block_input) {return;}

      console.log("real");
      this.preview.image.classList.add("swipeLeft");
      this.setCurrentImageAs(this.imageTypes.REAL);
    }

    this.onImageIsFake = function() {
      if(this.block_input) {return;}

      console.log("Fake");
      this.preview.image.classList.add("swipeRight");
      this.setCurrentImageAs(this.imageTypes.FAKE);
    }

    this.onImageIsWrongColor = function() {
      if(this.block_input) {return;}

      console.log("Wrong color");
      this.preview.image.classList.add("swipeUp");
      this.setCurrentImageAs(this.imageTypes.WRONG_COLOR);
    }

    this.setCurrentImageAs = function(type) {
      this.response.push({"image_owner": this.data[this.image_counter - 1].image_owner, "result": type});

      window.setTimeout(this.displayNextImage.bind(this), 1000);
      this.block_input = true;
    }

    this.createDisplay();
    document.addEventListener("keypress", this.onKeyPress.bind(this));
    channels.phaseThree.onmessage = this.onPhaseThreeMessage;
  }(channels);
}
