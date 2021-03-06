import './main.scss';

import Vue from 'vue';
import App from './App.vue';
import VueRouter from 'vue-router';
import router from './utils/routes';
import Meta from 'vue-meta';
import lineClamp from 'vue-line-clamp';
import VTooltip from 'v-tooltip';
import responsive from 'vue-responsive';

import Vuex from 'vuex';
import Notifications from 'vue-notification';

const snap = require(`imports-loader?this=>window,fix=>module.exports=0!snapsvg/dist/snap.svg.js`);
import BootstrapVue from 'bootstrap-vue';
import 'bootstrap';
import Environment from './utils/environment';
import {dom} from '@fortawesome/fontawesome-svg-core';

import {library} from '@fortawesome/fontawesome-svg-core';
import {fas} from '@fortawesome/free-solid-svg-icons';
import {fab} from '@fortawesome/free-brands-svg-icons';

import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
library.add(fas, fab);

dom.watch();

Vue.use(BootstrapVue);
Vue.config.productionTip = false;
Vue.use(VueRouter);
Vue.use(Vuex);
Vue.use(Notifications);
Vue.use(lineClamp);
Vue.use(VTooltip);
Vue.use(responsive);
Vue.use(require('vue-moment'));


Vue.use(Meta);
Vue.component('font-awesome-icon', FontAwesomeIcon);

const store = new Vuex.Store({
  state: {
    address: null,
    currentDistributes: [],
    intelReward: {},
    isLogged: false,
    userLastApprovedContractAddress: '',//This variable is needed so we when to increase approval of the user
    madeLogin: JSON.parse(window.localStorage.getItem('logged')),
    makingLogin: false,
    makingRequest: false,
    myTokens: 0,
    pathId: (window.localStorage.getItem('pathId')) || '',
    pendingTransactions: [],
    requestFinish: false,
    showModalSign: false,
    showModalLoginOptions: false,
    showModalLedgerNano: false,
    showModalOnboarding: true,
    showModalReward: false,
    showModalInfoGraphs: false,
    showModalInfoIntel: false,
    showModalEditProfile: false,
    showModalInfoLeaderboard: false,
    showModalInfoActivity: false,
    showModalInfoProfile: false,
    signType: (window.localStorage.getItem('signType')) || 'Metamask',
    ws: null,
    shoppingCart: [],
    showshopping: false,
    firstIntel: []
  },
  mutations: {
    addReward(state, data) {
      state.intelReward = data.intel;
      state.myTokens = data.tokens;
    },
    login(state, data) {
      state.isLogged = true;
      state.madeLogin = JSON.parse(window.localStorage.getItem('logged')),
        state.address = data.address.address || data.address;
      state.user = data.address;
      state.showModalSign = false;
      state.showModalLoginOptions = false;
      state.showModalLedgerNano = false;
      state.makingLogin = false;
      const dataSign = data.dataSign;
      let signType = '';
      let pathId = '';
      if (dataSign) {
        signType = dataSign.signType;
        pathId = dataSign.pathId;
        window.localStorage.setItem('signType', dataSign.signType);
        window.localStorage.setItem('pathId', dataSign.pathId);
      } else {
        signType = (window.localStorage.getItem('signType'));
        pathId = (window.localStorage.getItem('pathId'));
      }
      state.signType = signType;
      state.pathId = pathId;
    }, logout(state) {
      state.isLogged = false;
      state.address = null;
      state.showModalSign = false;
      state.showModalLoginOptions = false;
      state.showModalLedgerNano = false;
      state.madeLogin = 0;
      window.localStorage.setItem('logged', false);
      window.localStorage.removeItem("signType");
      window.localStorage.removeItem("pathId");
    }, intelEnter(state) {
      state.madeLogin = true;
      window.localStorage.setItem('logged', true);
    }, loadingLogin(state) {
      state.makingLogin = true;
    }, stopLogin(state) {
      state.showModalSign = false;
      state.showModalLoginOptions = false;
      state.showModalLedgerNano = false;
      state.makingLogin = false;
    }, iniWs(state) {
      state.ws = new WebSocket(Environment.webSocketURL);
    }, addTransaction(state, item) {
      if( !state.pendingTransactions.map(it=>{return it.txHash}).includes(item.txHash)  ){
          state.pendingTransactions.unshift(item);
      }

    }, assignTransactions(state, transactions) {
      state.pendingTransactions = [...state.pendingTransactions, ...transactions];
    }, editTransaction(state, {hash, key, value}) {
      state.pendingTransactions = state.pendingTransactions.map(item => {
        if (item.txHash === hash) {
          item[key] = value;
        }
        return item;
      });
    }, restartTransactions() {
      state.pendingTransactions = [];
    }, addDistribute(state, item) {
      state.currentDistributes.unshift(item);
    }, editDistribute(state, {hash, key, value}) {
      state.currentDistributes = state.currentDistributes.map(item => {
        if (item.txHash === hash) {
          item[key] = value;
        }
        return item;
      });
    }, deleteDistribute(state, intelId) {
      state.currentDistributes = state.currentDistributes.filter(item => item.intel !== intelId);
    }, openModalReward(state, open) {
      state.showModalReward = open;
    },openModalInfoProfile(state, open) {
      state.showModalInfoProfile = open;
    },openModalInfoActivity(state, open) {
      state.showModalInfoActivity = open;
    },openModalInfoLeaderboard(state, open) {
      state.showModalInfoLeaderboard = open;
    },openModalInfoIntel(state, open) {
      state.showModalInfoIntel = open;
    },openModalInfoGraphs(state, open) {
      state.showModalInfoGraphs = open;
    },openModalEditProfile(state, open) {
      state.showModalEditProfile = open;
    }, deleteTransaction(state, txHash) {
      state.pendingTransactions = state.pendingTransactions.filter(item => item.txHash !== txHash);
    }, setLastApprovedAddress(state, contractAddress) {
      state.userLastApprovedContractAddress = contractAddress;
    },  addProductToCart(state, product){
      state.shoppingCart.push(product)
    }, resetCart(state){
      state.shoppingCart = []
    }, showshoppingcart(state, show){
      state.showshopping = show
    }, updateCart(state, cart){
      state.shoppingCart = cart
    }, setFirstIntel(state, intels){
          state.firstIntel = intels
      }

  },
  actions: {
    login(context, address) {
      context.commit('login', address.address);
    },
    addTransaction(context, item) {
      context.commit('addTransaction', item);
    },
    assignTransactions(context, transactions) {
      context.commit('assignTransactions', transactions);
    },
    editTransaction(context, params) {
      //console.log(params);
      context.commit('editTransaction', params);
    },
    setFirstIntel(context, params) {
      context.commit('setFirstIntel', params);
    },
    transactionComplete(context, txHash) {
      context.commit('deleteTransaction', txHash);
    },addToCart(context, product){
      context.commit('addProductToCart', product)
    },resetShoppingCart(context){
      context.commit('resetCart')
    },handleshowshopping(context, show){
      context.commit('showshoppingcart', show)
    },updateShoppingCart(context, cart){
      context.commit('updateCart', cart)
    }
  }
});
new Vue({
  render: h => h(App),
  router,
  store, snap
}).$mount('#app');
