import http from './HttpService';
import environment from '../utils/environment';
import Identicon from 'identicon.js';
import errorService from "./errorService";

export default class profileService {
  static updateProfile(profile, onSuccess, onError) {
    http.post('/v1/updateuser', profile).then(
      res => {
        if (res.data.success) {
          return onSuccess(res.data);
        } else {
          return onError(errorService.sendErrorMessage('f28', res.data.message));
        }
      }).catch(error => {
      return onError(errorService.sendErrorMessage('f28', error));
    });
  }

  //Returns the current user profile, but if send a profile parameter (address), will return the query profile
  static getProfile(onSuccess, onError, profile = null) {
    //Saves the last searched profile
    const cachedProfile = this.getProfile.profile;

    //No profile parameter, send the cached profile
    if (cachedProfile && !profile) {
      return onSuccess(cachedProfile);
    } else {
      return http.get('/v1/userinfo', profile).then(res => {
        this.getProfile.profile = res.data.data;

        if (res.data.data)
          return onSuccess(res.data.data);
        else
          return onError(errorService.sendErrorMessage('f5', res.data.message));
      }).catch(error => {
        return onError(error);
      });
    }
  }

  static updateConfig(onFinish) {
    http.post('/v1/config_basic', {}).then(res => {
      res = res.data;

      let etherscan = "https://etherscan.io";
      switch (res.data.netWorkId) {
        case '3': {
          etherscan = "https://ropsten.etherscan.io";
          break;
        }
        case '4': {
          etherscan = "https://rinkeby.etherscan.io";
          break;
        }
        case '42': {
          etherscan = "https://kovan.etherscan.io";
          break;
        }

      }
      window.localStorage.setItem('etherscan', etherscan);
      window.localStorage.setItem('exponentBlock', res.data.exponentBlock);
      window.localStorage.setItem('public_key_stripe', res.data.public_key_stripe);
      window.localStorage.setItem('showshoppingcart', res.data.showshoppingcart);

      if (res.success && (res.data.intelAddress !== window.localStorage.getItem('intelAddress')
        || res.data.paretoAddress !== window.localStorage.getItem('paretoAddress')
        || res.data.netWorkId !== window.localStorage.getItem('netWorkId')
        || res.data.psignversion !== window.localStorage.getItem('psignversion'))) {
        http.post('/v1/config', {}).then(res => {
          res = res.data;
          if (res.success) {
            window.localStorage.setItem('intelAddress', res.data.intelAddress);
            window.localStorage.setItem('paretoAddress', res.data.paretoAddress);
            window.localStorage.setItem('netWorkId', res.data.netWorkId);
            window.localStorage.setItem('psignversion', res.data.psignversion);
            window.localStorage.setItem('intelc', JSON.stringify(res.data.intel));
            window.localStorage.setItem('paretoc', JSON.stringify(res.data.pareto));

          }
          if (onFinish) onFinish();
        }).catch(error => {
          if (onFinish) onFinish();
          errorService.sendErrorMessage('f30', error);
        });
      }
    }).catch(error => {
      if (onFinish) onFinish();
      errorService.sendErrorMessage('f30', error);
    });
  }

  //Returns a profile. If none address is defined, returns last searched user profile
  static getSpecificProfile(address, onSuccess, onError) {
    const profile = this.getSpecificProfile.profile || {};

    //Cached profile
    if (profile.address === address) {
      return profile;
    } else {
      http.get('/v1/userinfo/' + address).then(res => {
        if (!address) this.getSpecificProfile.profile = res.data.data;

        if (res.data.data) {
          return onSuccess(res.data.data);
        } else {
          return onError(errorService.sendErrorMessage('f29', res.data.message));
        }
      }).catch(error => {
        return onError(errorService.sendErrorMessage('f29', error));
      });
    }
  }

  //Returns profile image url or gravatar generated image using the address
  static getProfileImage(path, pic, profileAddress) {
    if (pic) return path + pic;

    //replaces not numeric hex characters: IdenticonJs only generates images based on numbers
    var data = new Identicon(profileAddress, 420).toString();
    return 'data:image/png;base64,' + data;
  }

  static uploadProfilePic(form, onSuccess, onError) {
    http.post('/upload-profile', form).then(res => {
      if (res.data.data.profile_pic) {
        onSuccess(res.data.data.profile_pic);
      } else {
        onError(errorService.sendErrorMessage('f31', res.data.message));
      }
    }).catch(error => {
      onError(errorService.sendErrorMessage('f31', error));
    });
  }
}
