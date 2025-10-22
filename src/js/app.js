App = {
  web3Provider: null,
  contracts: {},

  init: async function() {
    // Load initial pets from JSON
    $.getJSON('../pets.json', function(data) {
      var petsRow = $('#petsRow');
      var petTemplate = $('#petTemplate');

      for (var i = 0; i < data.length; i++) {
        petTemplate.find('.panel-title').text(data[i].name);
        petTemplate.find('img').attr('src', data[i].picture);
        petTemplate.find('.pet-breed').text(data[i].breed);
        petTemplate.find('.pet-age').text(data[i].age);
        petTemplate.find('.pet-location').text(data[i].location);
        petTemplate.find('.btn-adopt').attr('data-id', data[i].id);
        var $panel = $(petTemplate.html());
        $panel.find('.panel-pet').attr('data-id', data[i].id);
        $panel.find('.btn-adopt').attr('data-id', data[i].id);
        $panel.find('.btn-like').attr('data-id', data[i].id);
        $panel.find('.likes-count').text('0');
        petsRow.append($panel);
      }
      // 加载链上新注册的宠物
      App.loadNewPets();
    });
    return await App.initWeb3();
  },

  // Load new registered pets and display
  loadNewPets: async function() {
    try {
      const instance = await App.contracts.Adoption.deployed();
      const count = (await instance.getNewPetsCount.call()).toNumber();
      for (let index = 0; index < count; index++) {
        const petData = await instance.getNewPet.call(index);
        const name = petData[0];
        const age = petData[1].toNumber ? petData[1].toNumber() : petData[1];
        const location = petData[2];
        const breed = petData[3];
        const adopter = petData[4];
        const imgFilename = breed.toLowerCase().replace(/ /g, "-") + ".jpeg";
        const imgPath = "images/" + imgFilename;
        App.addPetToUI({
          id: index + 16,
          name: name,
          age: age,
          breed: breed,
          location: location,
          picture: imgPath,
          adopter: adopter
        });
      }
      // 标记已被领养的宠物
      App.markAdopted();
      App.initLikes();
    } catch (err) {
      console.error("Failed to load new pets:", err);
    }
  },

  addPetToUI: function(pet) {
    var petsRow = $('#petsRow');
    var $newPanel = $('#petTemplate > div').clone();
    $newPanel.attr('data-id', pet.id);
    $newPanel.find('.panel-title').text(pet.name);
    $newPanel.find('img').attr('src', pet.picture);
    $newPanel.find('.pet-breed').text(pet.breed);
    $newPanel.find('.pet-age').text(pet.age);
    $newPanel.find('.pet-location').text(pet.location);
    $newPanel.find('.btn-adopt').attr('data-id', pet.id);
    $newPanel.find('.btn-like').attr('data-id', pet.id);
    $newPanel.find('.likes-count').text('0');
    if (pet.adopter && pet.adopter !== '0x0000000000000000000000000000000000000000') {
      $newPanel.find('.btn-adopt').text('Success').attr('disabled', true);
    }
    $newPanel.find('.panel-pet').attr('data-id', pet.id);
    petsRow.append($newPanel);
  },



  initWeb3: async function() {
    if (window.ethereum) {
      App.web3Provider = window.ethereum;
      try {
        await window.ethereum.enable();
      } catch (error) {
        console.error("User denied account access");
      }
    } else if (window.web3) {
      App.web3Provider = window.web3.currentProvider;
    } else {
      App.web3Provider = new Web3.providers.HttpProvider('http://localhost:7545');
    }
    web3 = new Web3(App.web3Provider);

    return App.initContract();
  },

  initContract: function() {
    $.getJSON('Adoption.json', function(data) {
      var AdoptionArtifact = data;
      App.contracts.Adoption = TruffleContract(AdoptionArtifact);
      App.contracts.Adoption.setProvider(App.web3Provider);
      App.bindEvents();
      return App.markAdopted();
    });
  },

  bindEvents: function() {
    $(document).on('click', '.btn-adopt', App.handleAdopt);
    $(document).on('submit', '#registerForm', App.handleRegister);
    $(document).on('click', '#donateButton', App.handleDonate);
    $(document).on('click', '.btn-like', App.handleLike);
    // **新增**：绑定归还按钮事件
    $(document).on('click', '#returnButton', App.handleReturn);
  },

  // Mark adopted pets (initial and new)
markAdopted: function() {
  // 一定要 return 整个 promise 链，供外部 then() 使用
  return App.contracts.Adoption.deployed()
    .then(function(instance) {
      // 1. 标记初始的 16 只宠物
      return instance.getAdopters.call()
        .then(function(adopters) {
          adopters.forEach(function(addr, i) {
            if (addr !== '0x0000000000000000000000000000000000000000') {
              $('.panel-pet[data-id="' + i + '"]')
                .find('.btn-adopt')
                .text('Success')
                .attr('disabled', true);
            }
          });
          return instance;
        });
    })
    .then(function(instance) {
      // 2. 标记新注册的宠物
      return instance.getNewPetsCount.call()
        .then(function(countBN) {
          var count = countBN.toNumber();
          var jobs = [];
          for (let j = 0; j < count; j++) {
            // 每个 getNewPet 返回 [name, age, location, breed, adopter]
            jobs.push(
              instance.getNewPet.call(j).then(function(petData) {
                var adopter = petData[4];
                if (adopter !== '0x0000000000000000000000000000000000000000') {
                  $('.panel-pet[data-id="' + (16 + j) + '"]')
                    .find('.btn-adopt')
                    .text('Success')
                    .attr('disabled', true);
                }
              })
            );
          }
          // 等所有异步标记都完成
          return Promise.all(jobs);
        });
    })
    .catch(function(err) {
      console.error('markAdopted 出错：', err.message || err);
    });
},


handleAdopt: function(event) {
  event.preventDefault();
  var $btn = $(event.target);
  var petId = parseInt($btn.data('id'));

  // 1. 拿账户
  web3.eth.getAccounts(function(err, accounts) {
    if (err) {
      console.error('获取账户失败', err);
      return;
    }
    var account = accounts[0];

    // 2. 发交易，并等待链上确认
    App.contracts.Adoption.deployed()
      .then(function(instance) {
        return instance.adopt(petId, { from: account });
      })
      .then(function() {
        // 3. 链上打包成功后立刻更新按钮
        $btn.text('Success').attr('disabled', true);
        // 4. 重新标记所有已领养状态
        return App.markAdopted();
      })
      .then(function() {
        // 5. 再拉一次领养历史
        return App.loadAdoptionHistory();
      })
      .catch(function(err) {
        console.error('handleAdopt 出错：', err.message || err);
      });
  });
},


  // Register a new pet
  handleRegister: function(event) {
    event.preventDefault();
    var name = $('#petName').val().trim();
    var age = parseInt($('#petAge').val());
    var location = $('#petLocation').val().trim();
    var breed = $('#petBreed').val();
    var imgFilename = breed.toLowerCase().replace(/ /g, "-") + ".jpeg";
    var imgPath = "images/" + imgFilename;

    if (!name || isNaN(age) || !location || !breed) {
      alert("请填写完整宠物信息！");
      return;
    }

    web3.eth.getAccounts(function(err, accounts) {
      if (err) {
        console.error("Error fetching accounts", err);
        return;
      }
      var account = accounts[0];
      var weiValue;
      if (web3.utils && typeof web3.utils.toWei === 'function') {
        weiValue = web3.utils.toWei('0.0001', 'ether');
      } else if (typeof web3.toWei === 'function') {
        weiValue = web3.toWei('0.0001', 'ether');
      } else {
        weiValue = '100000000000000';
      }

      App.contracts.Adoption.deployed()
        .then(function(instance) {
          return instance.registerPet(name, age, location, breed, {
            from: account,
            value: weiValue
          });
        })
        .then(function() {
          return App.contracts.Adoption.deployed();
        })
        .then(function(instance) {
          return instance.getNewPetsCount.call();
        })
        .then(function(count) {
          var newIndex = count.toNumber() - 1;
          var newId = newIndex + 16;
          App.addPetToUI({
            id: newId,
            name: name,
            age: age,
            breed: breed,
            location: location,
            picture: imgPath,
            adopter: '0x0000000000000000000000000000000000000000'
          });
        })
        .catch(function(err) {
          alert("注册失败：" + (err.message || err));
        });
    });
  },

  // Donate to the pet shop
  handleDonate: function(event) {
    event.preventDefault();
    const value = $('#donateValue').val();
    if (!value || isNaN(value) || Number(value) <= 0) {
      return alert("请输入正确的数量（ETH）");
    }
    let weiValue;
    if (web3.utils && typeof web3.utils.toWei === 'function') {
      weiValue = web3.utils.toWei(value.toString(), 'ether');
    } else if (typeof web3.toWei === 'function') {
      weiValue = web3.toWei(value.toString(), 'ether');
    } else {
      weiValue = (Number(value) * 1e18).toString();
    }

    web3.eth.getAccounts((err, accounts) => {
      if (err) return console.error(err);
      var account = accounts[0];
      App.contracts.Adoption.deployed()
        .then(ins => ins.donate({ from: account, value: weiValue }))
        .then(() => alert("感谢您的捐赠！"))
        .catch(err => alert("捐款失败：" + err.message));
    });
  },
  
  // 拉取并更新某个宠物的点赞数到 UI
refreshLikes: function(petId) {
  App.contracts.Adoption.deployed()
    .then(ins => ins.getLikes.call(petId))
    .then(count => {
      $('.panel-pet').eq(petId).find('.likes-count').text(count.toNumber());
      return App.updateFamous();
    });
},

// 给宠物点赞
handleLike: function(event) {
  event.preventDefault();
  const petId = parseInt($(event.target).data('id'));
  web3.eth.getAccounts((err, accounts) => {
    if (err) return console.error(err);
    App.contracts.Adoption.deployed()
      .then(ins => ins.likePet(petId, { from: accounts[0] }))
      .then(() => App.refreshLikes(petId))
      .catch(err => console.error(err));
  });
},

// 重新计算并展示 Most Famous Pet
updateFamous: async function() {
  const ins = await App.contracts.Adoption.deployed();
  const newCount = (await ins.getNewPetsCount.call()).toNumber();
  const total = 16 + newCount;
  let max = 0, best = 0;
  for (let i = 0; i < total; i++) {
    const likes = (await ins.getLikes.call(i)).toNumber();
    if (likes > max) { max = likes; best = i; }
  }
  // 克隆最高人气卡片到右侧展示区
  const $card = $('.panel-pet').eq(best).clone();
  $('#famousPetCard').html($card);
},

// 页面初始化时统一加载所有点赞数
initLikes: async function() {
  const ins = await App.contracts.Adoption.deployed();
  const newCount = (await ins.getNewPetsCount.call()).toNumber();
  const total = 16 + newCount;
  for (let i = 0; i < total; i++) {
    const cnt = (await ins.getLikes.call(i)).toNumber();
    $('.panel-pet').eq(i).find('.likes-count').text(cnt);
  }
  App.updateFamous();
},
  


  // **新增**：加载并显示当前账户的领养历史
loadAdoptionHistory: function() {
  // 先用回调拿 accounts
  web3.eth.getAccounts((err, accounts) => {
    if (err) {
      console.error('获取账户失败', err);
      return;
    }
    const account = accounts[0];

    // 拿到合约实例后，在同一个回调作用域里使用它
    App.contracts.Adoption.deployed()
      .then(ins => {
        // 先取出历史总条数
        return ins.getAdoptionHistoryCount.call(account)
          .then(cntBN => {
            const cnt = cntBN.toNumber();
            // 顺序读出每一条
            const readList = [];
            for (let i = 0; i < cnt; i++) {
              // ins 依然在闭包里可用
              readList.push(ins.getAdoptionHistoryAt.call(account, i));
            }
            return Promise.all(readList);
          });
      })
      // pidBNs 是一个 BN 数组，将它们转成 Number 数组
      .then(pidBNs => pidBNs.map(bn => bn.toNumber()))
      // 渲染到页面，这里显示宠物名称而非 ID
      .then(petIds => {
        $('#historyArea').empty();
        $('#returnSelect').find('option:not(:first)').remove();
        if (petIds.length === 0) {
          $('#historyArea').append('<p>No adoption records.</p>');
        } else {
          petIds.forEach(pid => {
            // 从已有的 DOM 卡片中读取名称
            const petName = $('.panel-pet[data-id="' + pid + '"]')
                              .find('.panel-title')
                              .text() || `Pet ${pid}`;
            // 显示名称
            $('#historyArea').append(`<p>${petName}</p>`);
            // 下拉里也显示名称，value 保留为 pid
            $('#returnSelect').append(
              `<option value="${pid}">${petName}</option>`
            );
          });
        }
      })
      .catch(err => {
        console.error('loadAdoptionHistory 出错:', err);
      });
  });
},








  // **新增**：处理归还宠物事件
handleReturn: function(event) {
  event.preventDefault();
  const petId = parseInt($('#returnSelect').val());
  if (isNaN(petId)) {
    alert("Please select a pet to return.");
    return;
  }
  web3.eth.getAccounts((err, accounts) => {
    if (err) return console.error(err);
    const account = accounts[0];
    let feeWei = '1000000000000000';
    if (web3.utils && typeof web3.utils.toWei === 'function') {
      feeWei = web3.utils.toWei('0.001', 'ether');
    } else if (typeof web3.toWei === 'function') {
      feeWei = web3.toWei('0.001', 'ether');
    }
    App.contracts.Adoption.deployed()
      .then(instance => instance.returnPet(petId, { from: account, value: feeWei }))
      .then(() => {
        alert('Pet returned successfully!');
        return App.markAdopted();
      })
      .then(() => {
        App.loadAdoptionHistory();
      })
      .catch(err => {
        alert("Return failed: " + (err.message || err));
      });
  });
}


};

$(function() {
  $(window).load(async function() {
    await App.init();
    // **新增**：初始化后加载并显示领养历史
    App.loadAdoptionHistory();
  });
});
