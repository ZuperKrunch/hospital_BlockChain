# RuangSehat Hospital dApp

How to use this:
1. Buat akun metamask dulu
2. Download zip file ruangsehat di folder downloads
3. Extract zip filenya
4. Buat akun Infura
5. Copy API key di Infura, dan gantiin link tersebut dengan API key anda https://sepolia.infura.io/v3/API_DI_INFURA
6. Masuk ke env.example dan ini link yang anda sudah isi dengan API key di bagian RPC_URL
7. Import/Copy isi dari RuangSehat.sol di folder contracts github, dan paste ke remixIDE
8. Habis compile, tinggal dirun
9. Setelah sudah run cari function setPublisher
10. Isi colom setPublisher dengan id Wallet metamask dan confirm di metamask
11. Address dari ruangsehat (di deployed contracts, ada RuangSehat dan tanda copy, nah copy itu)
12. Balik ke ENV.example dan masukkan address ruangsehat ke CONTACT_ADDRESS
13. Lalu di metamask, pencet tanda panah kebawah di bagian kiri atas, dan kebagian accounts
14. Pencet titik 3 yang disamping username & wallet address
15. Pilih opsi Account details
16. Pilih opsi private keys, enter password, dan nanti copy private key ke ENV bagian PUBLISHER_PRIVATE_KEY
17. habis itu setelah semuanya sudah kelar save ENV.examplenya menjadi ENV
18. setelah buka terminal di folder extract C:\RuangSehat-Hospital-dApp-Offchain\ruangsehat-hospital
19. Dan lakukan npm ci terlebih dahulu baru npm run dev
20. baru ke http://localhost:5173
