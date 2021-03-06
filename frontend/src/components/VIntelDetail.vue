<template>
    <div class="main wrapp pareto-blue-dark">
        <div class="container-fluid px-lg-5">
            <div class="row m-0 pt-4 pt-lg-2" style="width: 100%;">
                <div class="col-12 order-last order-lg-first col-lg-2 mr-2 mb-4">
                    <VProfile :addressProfile="intel.address" :profileObject="profile"></VProfile>
                </div>
                <div class="col-12 col-lg-8 mb-4 px-1 intel-container">
                    <div class="row m-0 text-group">
                        <VShimmerIntelInformation v-if="!intel.block"></VShimmerIntelInformation>
                        <div v-else class="col-12 p-4" :style="getBorderLeft(intel.priority)">
                            <div class="row py-3 m-0">
                                <div class="col-md-10 p-0 pr-1"> <!-- add redacted class back to p when fixed -->
                                    <p class="title-user-content" v-html="convertToHideText(intel.title)"></p>
                                </div>
                            </div>
                            <div class="row text-content m-0">
                                <a v-bind:href="etherscanUrl+'/tx/'+intel.txHash"
                                   target="_blank" class="mr-4">
                                    <i class="fa fa-th-large green-color mr-2"></i>
                                    <ICountUp
                                            :startVal="parseFloat(intel.block) + parseFloat(intel.blockAgo)"
                                            :endVal="parseFloat(intel.blockAgo)"
                                            :decimals="decimalsLength(intel.blockAgo)"
                                            :duration="randomNumber(1,3)"
                                            :options="countUp.options"
                                            @ready="onReady"/>

                                </a>
                                <a v-bind:href="etherscanUrl+'/tx/'+intel.txHash"
                                   target="_blank" class="mr-4">
                                    <i class="fa fa-calendar green-color mr-2"></i>
                                    {{ dateStringFormat(intel.dateCreated)| moment('from', 'now') }}
                                </a>
                            </div>
                            <div class="text-group mt-4"> <!-- add redacted class back to p when fixed -->
                                <p class="intel-body text-user-content" v-html="convertToHideText(intel.body)"></p>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-12 mb-4 col-lg-1">
                    <VIntelButtonAction :user="user" :intel="intel"></VIntelButtonAction>
                    <p v-if="intel.totalReward>0" class="text-right ellipsis mr-4">
                        <font-awesome-icon class="green-color" :icon="['fas', 'coins']"/>&nbsp;
                        {{ intel.totalReward }}
                    </p>
                </div>
            </div>
        </div>
    </div>
</template>
<script>
  import DashboardService from '../services/dashboardService';
  import ProfileService from '../services/profileService';
  import {convertToHideText} from '../utils/Utils';
  import ICountUp from 'vue-countup-v2';
  import {mapActions, mapMutations, mapState} from 'vuex';
  import {countUpMixin} from '../mixins/countUp';
  import AuthService from '../services/authService';
  import environment from '../utils/environment';

  import VProfile from './VProfile.vue';

  import VShimmerUserProfile from './Shimmer/IntelDetailView/VShimmerUserProfile';
  import VShimmerIntelInformation from './Shimmer/IntelDetailView/VShimmerIntelInformation';
  import VIntelButtonAction from './Events/VIntelButtonAction';

  import VModalReward from './Modals/VModalReward';

  export default {
    name: 'VIntelDetail',
    mixins: [countUpMixin],
    components: {
      ICountUp,
      VShimmerUserProfile,
      VShimmerIntelInformation,
      VProfile,
      VIntelButtonAction,
      VModalReward
    },
    computed: {
      ...mapState(['ws', 'signType', 'pendingTransactions', 'showModalReward'])
    },
    data: function () {
      return {
        id: this.$route.params.id,
        profileObject: true,
        loading: true,
        intel: {},
        address: {},
        etherscanUrl: window.localStorage.getItem('etherscan'),
        profile: {
          address: '',
          alias: '',
          biography: '',
          rank: 1000
        },
        user: {},
        baseURL: environment.baseURL
      };
    },
    beforeMount: function () {
      this.$store.state.makingRequest = true;
      this.requestCall();
    },
    methods: {
      ...mapMutations(['iniWs', 'openModalReward']),
      ...mapActions(['addTransaction', 'transactionComplete', 'editTransaction']),
      dateStringFormat(date) {
        return new Date(date);
      },
      isAvailable() {
        if (this.signType === 'LedgerNano') {
          this.hardwareAvailable = false;
          AuthService.doWhenIsConnected(() => {
            this.hardwareAvailable = true;
            AuthService.deleteWatchNano();
          });
        } else {
          this.hardwareAvailable = true;
        }
      },
      getIntelById: function () {
        return DashboardService.getIntelById(this.id, res => {
          this.getProfile(res.address);
          this.intel = res;
        }, error => {
        });
      },
      convertToHideText: function (text) {
        return convertToHideText(text);
      },
      getProfile: function (address) {
        ProfileService.getSpecificProfile(address, res => {
          this.profile = res;
          this.loading = false;
        }, error => {
        });
      },
      getAddress: function () {
        return DashboardService.getAddress(res => {
          this.address = res;
        }, () => {
          alert(error);
        });
      },
      socketConnection() {
        let params = {rank: this.rank, limit: 100, page: this.page};
        if (!this.ws) {
          this.iniWs();
          let wss = this.ws;
          this.ws.onopen = function open() {
            wss.send(JSON.stringify(params));
          };
        }
        this.overrideOnMessage();
      },
      loadProfile: function () {
        return ProfileService.getProfile(
          res => {
            this.user = res;
          },
          () => {
          }
        );
      },
      overrideOnMessage() {
        this.ws.onmessage = (data) => {
          try {
            const info = JSON.parse(data.data);

            if (info.data.address) {
              this.intel.blockAgo = info.data.block - this.intel.block;
            }
          } catch (e) {
            console.log(e);
          }
        };
      },
      pendingRowTransactions: function (intel) {
        let transactionPending = false;
        this.pendingTransactions.forEach(transaction => {
          if (intel.id === transaction.intel) {
            transactionPending = true;
          }
        });
        return transactionPending;
      },
        getBorderLeft(priority) {
            switch(priority){
                case 1:{
                    return {"border-left": "0.5rem solid", "border-left-color": "#c24e4e !important"}
                }
                case 2:{
                    return {"border-left": "0.5rem solid", "border-left-color": "#ca9036 !important"}
                }
                case 3:{
                    return {"border-left": "0.5rem solid", "border-left-color": "#6ac27e !important"}
                }
                case 4:{
                    return {"border-left": "0.5rem solid", "border-left-color": "#294b83 !important"}
                }
            }


            return {};
        },
      requestCall: function () {
        Promise.all([
          this.getIntelById(),
          this.getAddress(),
          this.loadProfile()
        ]).then(values => {

          this.$store.state.makingRequest = false;
          this.socketConnection();
        });
      }
    }
  };
</script>

<style>
    .intel-body img {
        max-width: 100%;
    }

    .intel-container a:hover {
        color: whitesmoke;
    }

    .redacted span {
        position: relative;
        white-space: pre;
    }

    .redacted span:after {
        background: black;
        border-radius: 0.1em;
        box-shadow: 0 0 1px rgba(0, 0, 0, 0.35);
        content: " ";
        width: 100%;
        height: 1.3em;
        left: 0;
        position: absolute;
        transform: skewY(-5deg) rotate(5deg);
    }
</style>
