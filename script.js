'use strict';

let map, mapEvent, coords;

class Workout {
  date = new Date();
  id = (Date.now() + '').slice(-10);

  constructor(coords, distance, duration) {
    this.coords = coords; // [lat, lng]
    this.distance = distance; // in km
    this.duration = duration; // in min.
  }

  _setDescription() {
    // prettier-ignore
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 
    'September', 'October', 'November', 'December'];

    this.description = `${this.type[0].toUpperCase()}${this.type.slice(1)} on ${
      months[this.date.getMonth()]
    } ${this.date.getDate()}`;
  }
}

class Running extends Workout {
  type = 'running';

  constructor(coords, distance, duration, cadence) {
    super(coords, distance, duration);
    this.cadence = cadence;
    this.calcPace();
    this._setDescription();
  }

  calcPace() {
    // min/km
    this.pace = this.duration / this.distance;
    return this.pace;
  }
}

class Cycling extends Workout {
  type = 'cycling';

  constructor(coords, distance, duration, elevationGain) {
    super(coords, distance, duration);
    this.elevationGain = elevationGain;
    this.calcSpeed();
    this._setDescription();
  }

  calcSpeed() {
    this.speed = this.distance / (this.duration / 60);
    return this.speed;
  }
}

// const run1 = new Running([39, -12], 5.2, 24, 178);
// const cycling1 = new Cycling([39, -12], 27, 95, 523);
// console.log(run1, cycling1);

//////////////////////////////////////////////
//////////////////////////// APP ARCHTIECTURE
const sidebar = document.querySelector('.sidebar');
const form = document.querySelector('.form');
const containerWorkouts = document.querySelector('.workouts');
const inputType = document.querySelector('.form__input--type');
const inputDistance = document.querySelector('.form__input--distance');
const inputDuration = document.querySelector('.form__input--duration');
const inputCadence = document.querySelector('.form__input--cadence');
const inputElevation = document.querySelector('.form__input--elevation');
const centerBtn = document.querySelector('.btn-center');
const deleteBtn = document.querySelector('.btn-delete');

class App {
  #map;
  #mapEvent;
  markerGroup;

  #zoom = 16;
  workouts = [];
  #initialWorkouts = this.workouts;
  #coords;
  #markerOpen = false;
  marker;
  #editFormOpen = false;
  #curWorkout;

  distanceSort = false;
  durationSort = false;

  filters = ['filter by type', 'running', 'cycling'];
  filter = 0;
  prevFiltered;

  constructor() {
    // Get user's position
    this._getPosition();

    // Attach event handlers
    form.addEventListener('submit', this._newWorkout.bind(this));
    inputType.addEventListener('change', this._toggleElevationField.bind(this));
    containerWorkouts.addEventListener('click', this._moveToPopup.bind(this));
    containerWorkouts.addEventListener('click', this._showEditForm.bind(this));
    containerWorkouts.addEventListener('click', this._deleteWorkout.bind(this));
    sidebar.addEventListener('click', this._deleteAll.bind(this));
    document.addEventListener('click', function(e) {
      if(!e.target.classList.contains('.form')) {
        this._closeEditForm();
        if(e.target.id === 'map') {
          this._showForm(this.#mapEvent);
        }
      }
    }.bind(this));

    centerBtn.addEventListener('click', this._centerMap.bind(this));
    document.addEventListener(
      'keydown',
      function (e) {
        if (e.key === 'Escape') {
          this._cancelWorkout();
          this._closeEditForm();
          this._hideError();
        }
      }.bind(this)
    );

    sidebar.addEventListener('click', this._sortAndFilter.bind(this));
  }

  _getPosition() {
    if (navigator.geolocation)
      navigator.geolocation.getCurrentPosition(
        this._loadMap.bind(this),
        function () {
          alert('Could not fetch position');
        }
      );
  }

  _loadMap(position) {
    // set form display to none
    form.style.display = 'none';

    const { latitude, longitude } = position.coords;
    this.#coords = [latitude, longitude];

    const urlParams = new URLSearchParams(window.location.search);
    const key = urlParams.get('key') || 'lVPwez4U9OA30kU8dZMt';

    this.#map = L.map('map').setView(this.#coords, this.#zoom);

    this.markerGroup =  L.layerGroup().addTo(this.#map);

    // Get data from local storage
    this._getLocalStorage();

    L.tileLayer(
      `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${key}`,
      {
        tileSize: 512,
        zoomOffset: -1,
        minZoom: 1,
        attribution:
          '\u003ca href="https://www.maptiler.com/copyright/" target="_blank"\u003e\u0026copy; MapTiler\u003c/a\u003e \u003ca href="https://www.openstreetmap.org/copyright" target="_blank"\u003e\u0026copy; OpenStreetMap contributors\u003c/a\u003e',
        crossOrigin: true,
      }
    ).addTo(this.#map);


    const marker = L.marker(this.#coords)
      .addTo(this.markerGroup)
      .bindPopup()
      .setPopupContent('You are here');

    marker.on('mouseover', function () {
      this.openPopup();
    });

    marker.on('mouseout', function () {
      this.closePopup();
    });

    // Handling clicks on map
    this.#map.on('click', this._showForm.bind(this));
  }

  _renderDeleteBtn() {
    this.workouts.length >= 2 ? deleteBtn.classList.remove('hidden') : deleteBtn.classList.add('hidden');
  }

  _centerMap(e) {
    e.stopPropagation();
    this.#map.setView(this.#coords, this.#zoom, {
      animate: true,
      pan: {
        duration: 1.3,
      },
    });
  }

  _showForm(mapE) {
    this.#mapEvent = mapE;

    if (this.#markerOpen) {
      this.marker.remove();
      this.#markerOpen = false;
    }

    this.marker = L.marker([mapE.latlng.lat, mapE.latlng.lng])
      .addTo(this.markerGroup)
      .bindPopup(
        L.popup({
          autoClose: false,
          closeButton: false,
        })
      )
      .setPopupContent('✏️ New workout here...')
      .openPopup();
      
    this.#markerOpen = true;

    if (this.#editFormOpen) return;
    
    this._clearInputs();
    containerWorkouts.prepend(form);
    form.style.display = 'grid';
    form.classList.remove('hidden');
    form.style.minHeight = 'initial';
    inputDistance.focus();
  }

  _clearInputs() {
    // Clear input
    inputDistance.value =
      inputCadence.value =
      inputDuration.value =
      inputElevation.value =
        '';
  }

  _hideForm() {
    this._clearInputs();

    form.style.display = 'none';
    form.classList.add('hidden');
    setTimeout(() => (form.style.display = 'grid'), 1000);
  }

  _cancelWorkout() {
    if(this.#editFormOpen) return;

    this._clearInputs();

    form.style.display = 'none';
    form.classList.add('hidden');
    if (this.marker) this.marker.remove();
    this.#markerOpen = !this.#markerOpen;
  }

  _toggleElevationField() {
    inputElevation.closest('.form__row').classList.toggle('form__row--hidden');
    inputCadence.closest('.form__row').classList.toggle('form__row--hidden');
  }

  _displayError(el, message) {
    const errorMsg = document.querySelector('.bar.error');

    if (errorMsg) return;

    el.insertAdjacentHTML('beforebegin', `<div class="bar error">${message}</div>`);
  }

  _hideError() {
    const errorMsg = document.querySelector('.bar.error');

    if (!errorMsg) return;

    errorMsg.outerHTML = '';
  }

  _newWorkout(e) {
    e.preventDefault();

    const isValidInputs = (...inputs) =>
      inputs.every(inp => Number.isFinite(inp));
    const isPositiveInputs = (...inputs) => inputs.every(inp => inp > 0);

    //Get data from form
    const type = inputType.value;
    const distance = +inputDistance.value;
    const duration = +inputDuration.value;

    if (!this.#editFormOpen) {
      const { lat, lng } = this.#mapEvent.latlng;
      let workout;

      // If workout running, create running object
      if (type === 'running') {
        const cadence = +inputCadence.value;
        // Check if data is valid
        if (
          !isValidInputs(distance, duration, cadence) ||
          !isPositiveInputs(distance, duration, cadence)
        )
          return this._displayError(containerWorkouts, 'Inputs must be positive numbers!');

        // Add new object to workout array
        workout = new Running([lat, lng], distance, duration, cadence);
        this.workouts.push(workout);
      }

      // If workout cycling, create cycling object
      if (type === 'cycling') {
        const elevation = +inputElevation.value;
        // Check if data is valid
        if (
          !isValidInputs(distance, duration, elevation) ||
          !isPositiveInputs(distance, duration)
        )
          return this._displayError(containerWorkouts, 'Distance and duration must be positive numbers!');

        // Add new object to workout array
        workout = new Cycling([lat, lng], distance, duration, elevation);
        this.workouts.push(workout);
      }

      // remove current 'new workout' marker
      this.marker.remove();

      // Render workout on map as marker
      this._renderWorkoutMarker(workout);

      // Render workout on list
      this._renderWorkout(workout);

      // Hide form + clear input fields
      this._hideForm();

      // Set local storage to all workouts
      this._setLocalStorage();

      // Hide error message
      this._hideError();
    }

    // Update workout
    if (this.#editFormOpen) this._updateWorkout();
  }

  _showEditForm(e) {
    // handle click
    e.stopPropagation();
    
    const editBtn = e.target.closest('.btn-edit');
    if (!editBtn) return;

    if (this.#curWorkout) this.#curWorkout.style.display = 'grid';
      
    this.#curWorkout = editBtn.closest('.workout');
    
    const curWorkoutObj = this.workouts.find(el => el.id === this.#curWorkout.dataset.id);

    // show form in place
    const cardHeight = `${this.#curWorkout.getBoundingClientRect().height}px`;
    this._clearInputs();
    this.#curWorkout.style.display = 'none';
    form.classList.remove('hidden');
    form.style.display = 'grid';
    form.style.minHeight = cardHeight;
    this.#curWorkout.before(form);
    this.#editFormOpen = true;
    
    inputDistance.value = curWorkoutObj.distance;
    inputDuration.value = curWorkoutObj.duration;
    
    if(curWorkoutObj.type === 'running') {
      inputType.value = curWorkoutObj.type;
      inputCadence.value = curWorkoutObj.cadence;
      if(inputCadence.closest('.form__row').classList.contains('form__row--hidden')) this._toggleElevationField();
    }
    
    if(curWorkoutObj.type === 'cycling') {
      inputType.value = curWorkoutObj.type;
      inputElevation.value = curWorkoutObj.elevationGain;
      if(inputElevation.closest('.form__row').classList.contains('form__row--hidden')) this._toggleElevationField();
    }
  
  }

  _closeEditForm() {
    if (this.#editFormOpen) {
      this.#editFormOpen = false;
      this.#curWorkout.style.display = 'grid';
      form.style.display = 'none';
      form.classList.add('hidden');
    }
  }

  _updateWorkout() {
    const isValidInputs = (...inputs) =>
      inputs.every(inp => Number.isFinite(inp));
    const isPositiveInputs = (...inputs) => inputs.every(inp => inp > 0);

    let arrPos, workout;

    const [lat, lng] = this.workouts.find(
      el => el.id === this.#curWorkout.dataset.id
    ).coords;

    const type = inputType.value;
    const distance = +inputDistance.value;
    const duration = +inputDuration.value;

    // function to delete workout to be updated and all markers
    function delWorkoutToUpdate(workouts) {
      workouts.forEach((wrkt, i, arr) => {
        if (wrkt.id === this.#curWorkout.dataset.id) {
          arr.splice(i, 1);
          arrPos = i;
        }
        // remove all workout markers
        this.markerGroup.removeLayer(wrkt.markerId);
      })
    }

    // If workout running, create running object
    if (type === 'running') {
      
      const cadence = +inputCadence.value;
      // Check if data is valid
      if (
        !isValidInputs(distance, duration, cadence) ||
        !isPositiveInputs(distance, duration, cadence)
        )
        return this._displayError(this.#curWorkout, "Inputs must be positive numbers!");
        
      // delete workout to be updated and all markers
      delWorkoutToUpdate.call(this, this.workouts);

      // Add new object to workout array
      workout = new Running([lat, lng], distance, duration, cadence);
      this.workouts.splice(arrPos, 0, workout);
    }

    // If workout cycling, create cycling object
    if (type === 'cycling') {
      const elevation = +inputElevation.value;
      // Check if data is valid
      if (
        !isValidInputs(distance, duration, elevation) ||
        !isPositiveInputs(distance, duration)
        ) {
          console.log(errorMsg);
          return this._displayError(this.#curWorkout, "Distance and duration must be positive numbers!");
        }
        
        
      // delete workout to be updated and all markers
      delWorkoutToUpdate.call(this, this.workouts);
      
      // Add new object to workout array
      workout = new Cycling([lat, lng], distance, duration, elevation);
      this.workouts.splice(arrPos, 0, workout);
    }

    this._setLocalStorage();

    // Delete every entry from container
    containerWorkouts.innerHTML = '';

    // add updated back
    this._getLocalStorage();

    // hide error message
    this._hideError();

    // hide edit form
    this._closeEditForm();
  }

  _deleteWorkout(e) {
    e.stopPropagation();

    const deleteBtn = e.target.closest('.btn-delete-one');
    if (!deleteBtn) return;

    deleteBtn.innerHTML = 'Deleting...';

    let coords;
    
    setTimeout(() => {
      // remove all workout markers
      this.workouts.forEach(el => this.markerGroup.removeLayer(el.markerId));

      // Find current workout in workouts array and remove it
      this.workouts.forEach((el, i, arr) => {
        if (el.id === deleteBtn.parentNode.parentNode.dataset.id) {
          coords = el.coords;
          arr.splice(i, 1);
        }
      });
  
      this._setLocalStorage();
      
      // Delete every entry from container
      containerWorkouts.innerHTML = '';
      
      // add updated back
      this._getLocalStorage();
  
      // center map on deleted workout
      this.#map.setView(coords, this.#zoom);
    }, 1200)
  }

  _renderWorkoutMarker(workout) {
    const marker = L.marker(workout.coords)
      .addTo(this.markerGroup)
      .bindPopup(
        L.popup({
          maxWidth: 250,
          minWidth: 100,
          autoClose: false,
          closeOnClick: false,
          className: `${workout.type}-popup`,
        })
      )
      .setPopupContent(
        `${workout.type === 'running' ? '🏃' : '🚴'} ${workout.description}`
      )
      .openPopup();
    
    // set workout marker id
    workout.markerId = marker._leaflet_id;
  }

  _renderWorkout(workout) {
    let html = `
      <li class="workout workout--${workout.type}" data-id="${workout.id}">
        <h2 class="workout__title">${workout.description}</h2>
        <div class="workout__details">
          <span class="workout__icon">${
            workout.type === 'running' ? '🏃' : '🚴'
          }</span>
          <span class="workout__value">${workout.distance}</span>
          <span class="workout__unit">km</span>
        </div>
        <div class="workout__details">
          <span class="workout__icon">⏱️</span>
          <span class="workout__value">${workout.duration}</span>
          <span class="workout__unit">min</span>
        </div>
    `;

    const buttons = `
      <div class="action-btns-container">
        <button class="btn btn-edit">✏️&nbsp;&nbsp;&nbsp;Edit</button><button class="btn btn-delete btn-delete-one">❌&nbsp;&nbsp;&nbsp;Remove</button>
      </div>
      `;

    if (workout.type === 'running')
      html += `
        <div class="workout__details">
          <span class="workout__icon">⚡️</span>
          <span class="workout__value">${workout.pace.toFixed(1)}</span>
          <span class="workout__unit">min/km</span>
        </div>
        <div class="workout__details">
          <span class="workout__icon">🦶🏼</span>
          <span class="workout__value">${workout.cadence}</span>
          <span class="workout__unit">spm</span>
        </div>
        ${buttons}
      </li>
      `;

    if (workout.type === 'cycling')
      html += `
        <div class="workout__details">
          <span class="workout__icon">⚡️</span>
          <span class="workout__value">${workout.speed.toFixed(1)}</span>
          <span class="workout__unit">km/h</span>
        </div>
        <div class="workout__details">
          <span class="workout__icon">⛰️</span>
          <span class="workout__value">${workout.elevationGain}</span>
          <span class="workout__unit">m</span>
        </div>
        ${buttons}
      </li>
      `;
    
    containerWorkouts.insertAdjacentHTML('afterbegin', html);
  }

  _moveToPopup(e) {
    const workoutEl = e.target.closest('.workout');
    if (!workoutEl) return;

    const workout = this.workouts.find(
      wkOut => wkOut.id === workoutEl.dataset.id
    );

    this.#map.setView(workout.coords, this.#zoom, {
      animate: true,
      pan: {
        duration: 1,
      },
    });
  }

  _deleteAll(e) {
    if (this.workouts.length <= 0 || !e.target.classList.contains('btn-delete-all')) return;
    
    // remove all markers from map
    if(!this.prevFiltered)
    this.workouts.forEach(el => this.markerGroup.removeLayer(el.markerId));
    else
    this.prevFiltered.forEach(el => this.markerGroup.removeLayer(el.markerId));

    // remove all workouts from array
    this.workouts.splice(0);

    // set local storage to new workouts array
    this._setLocalStorage();
      
    // Delete every entry from container
    containerWorkouts.innerHTML = '';
    
    // add updated entries back, if any
    this._getLocalStorage();
  }

  _renderSortBtns() {
    const sortContainer = document.querySelector('.sort-btns-container');
    this.workouts.length >= 2 ? sortContainer.classList.remove('hidden') : sortContainer.classList.add('hidden');
  }

  _sort(workouts, toggle, val) {
    workouts.sort((a, b) => this[toggle] ? b[val] - a[val] : a[val] - b[val]);

    // set toggle to opposite
    this[toggle] = !this[toggle];

    // Delete every entry from container
    containerWorkouts.innerHTML = '';

    // re-render workouts
    workouts.forEach(cur => {
      this._renderWorkout(cur);
    });
  }

  _filter() {
    this.filter === 2 ? this.filter = 0 : this.filter++;
    
    //change button text
    document.querySelector('.btn-filter').innerText = this.filters[this.filter][0].toUpperCase() + this.filters[this.filter].slice(1);

    if (this.filter === 0) {
      this._resetWrktContainer(this.prevFiltered);
      
      this.workouts.forEach(cur => {
        this._renderWorkout(cur);
        this._renderWorkoutMarker(cur);
      });

      this.prevFiltered = undefined;

      return;
    }
    
    if (!this.prevFiltered) this.workouts.forEach(cur => this.markerGroup.removeLayer(cur.markerId))
    else this.prevFiltered.forEach(cur => this.markerGroup.removeLayer(cur.markerId));


    const filtered = this.workouts.filter(el => el.type === this.filters[this.filter]);
    
    // Delete every entry from container
    containerWorkouts.innerHTML = '';
    
    // re-render workouts
    filtered.forEach(cur => {
      this._renderWorkout(cur);
      this._renderWorkoutMarker(cur);
    });
    
    this.prevFiltered = filtered;
  }

  _sortAndFilter(e) {
    if(e.target.classList.contains('btn-sort')) {
      if (!this.prevFiltered) this._sort(this.workouts, `${e.target.dataset.value}Sort`, e.target.dataset.value);
      else this._sort(this.prevFiltered, `${e.target.dataset.value}Sort`, e.target.dataset.value);

      // render arrows
      if (!e.target.innerText.includes('⬆️') && !e.target.innerText.includes('⬇️')) return e.target.innerText = e.target.innerText + ' ⬆️';
      else if (e.target.innerText.includes('⬆️')) return e.target.innerText = e.target.innerText.slice(0, -2) + ' ⬇️';
      else return e.target.innerText = e.target.innerText.slice(0, -2) + ' ⬆️';
    }

    if(e.target.classList.contains('btn-filter')) {
      this._filter();
    }
  }


  _setLocalStorage() {
    localStorage.setItem('workouts', JSON.stringify(this.workouts));

    this._renderDeleteBtn();
    this._renderSortBtns();
  }

  _getLocalStorage() {
    const data = JSON.parse(localStorage.getItem('workouts'));

    if (!data) return;

    this.workouts = data;

    this.workouts.forEach(cur => {
      this._renderWorkout(cur);
      this._renderWorkoutMarker(cur);
    });

    // render delete all button based on workout number
    this._renderDeleteBtn();
    this._renderSortBtns();
  }

  _resetWrktContainer(workouts) {
    // remove all workout markers
    workouts.forEach(el => this.markerGroup.removeLayer(el.markerId));

    // Delete every entry from container
    containerWorkouts.innerHTML = '';
  }

  resetLocalStorage() {
    localStorage.removeItem('workouts');
    location.reload();
  }
}

const app = new App();
