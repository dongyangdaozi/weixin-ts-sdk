import axios from "axios";
import {
  IOfficialAccountConfig,
  IAccessTokenResponse,
  IAccessToken
} from "./interface";
import { MPServer } from "./server";
import { TemplateMessage } from "./template-message";
import { CustomerService } from "./customer-service";

export class OfficialAccount {
  config: IOfficialAccountConfig;

  /**
   * 默认内存存储
   * ttl 秒后过期
   */
  private storage = {
    accessToken: Object,
    set(token: string, ttl: number) {
      this.accessToken = { token, expiresAt: +new Date() + 1000 * ttl };
    },
    get(): string | Promise<string> {
      return this.accessToken && this.accessToken.expiresAt > +new Date()
        ? this.accessToken.token
        : null;
    }
  };

  http = axios.create({ baseURL: "https://api.weixin.qq.com" });

  server: MPServer = new MPServer(this);
  templateMessage: TemplateMessage = new TemplateMessage(this);
  customerService: CustomerService = new CustomerService(this);

  constructor(config: IOfficialAccountConfig) {
    this.config = config;
    if (config.storage) {
      this.storage.set = config.storage.set;
      this.storage.get = config.storage.get;
    }
    this.http.interceptors.request.use(
      async config => {
        const token = await this.getAccessToken();
        if (token) {
          config.params = Object.assign(config.params || {}, {
            access_token: token
          });
        }
        return config;
      },
      error => {
        return Promise.reject(error);
      }
    );
  }

  async getAccessToken(): Promise<string> {
    let token = await this.storage.get();
    if (!token) {
      const AccessToken = await this.getAccessTokenFromServer();
      token = AccessToken.accessToken;
      this.storage.set(token, AccessToken.expiresIn - 60 * 30);
    }
    return token;
  }

  /**
   * ===============================================
   * 以下调用微信API
   * ===============================================
   */

  /**
   * 直接从微信服务器获取 Token
   * https://mp.weixin.qq.com/wiki?t=resource/res_main&id=mp1421140183
   */
  private async getAccessTokenFromServer(): Promise<IAccessToken> {
    const url = "https://api.weixin.qq.com/cgi-bin/token";
    const params = {
      appid: this.config.appId,
      secret: this.config.secret,
      grant_type: "client_credential"
    };
    const resp: IAccessTokenResponse = await axios.get(url, {
      params
    });
    if (resp.data.errcode) {
      throw new Error(
        `获取公众号AccessToken失败: ${JSON.stringify(resp.data)}`
      );
    }
    return {
      accessToken: resp.data.access_token,
      expiresIn: resp.data.expires_in
    };
  }
}
