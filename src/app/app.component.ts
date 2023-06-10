import { Component } from '@angular/core';
import { WalletConnectService } from "./wallet-connect-service.service";
import { BehaviorSubject, tap } from "rxjs";

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'walletconnect-chia-angular';

  constructor(private walletConnectService: WalletConnectService) {
  }

  session$ = this.walletConnectService.session$;

  connect() {
    this.walletConnectService.connect()
  }

  disconnect() {
    this.walletConnectService.disconnect();
  }

  async getWallets() {
    const { result } = await this.walletConnectService.getWallets();
    console.log(result)
  }

  async signMessageById(id: string, message: string) {
    const { result } = await this.walletConnectService.signMessageById(id, message);
    console.log(result)
  }
}
